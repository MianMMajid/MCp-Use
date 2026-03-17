/**
 * scim-routes.js
 *
 * Phase 4: SCIM 2.0 provisioning endpoints. Enables enterprise identity
 * providers (Okta, Azure AD, OneLogin, etc.) to manage user lifecycle
 * events — create, update, deactivate — via a standardized protocol.
 *
 * SCIM 2.0 resource endpoints:
 *   GET    /scim/v2/Users
 *   GET    /scim/v2/Users/:id
 *   POST   /scim/v2/Users
 *   PUT    /scim/v2/Users/:id
 *   PATCH  /scim/v2/Users/:id
 *   DELETE /scim/v2/Users/:id
 *
 * SCIM 2.0 discovery endpoints:
 *   GET    /scim/v2/ServiceProviderConfig
 *   GET    /scim/v2/Schemas
 *
 * SCIM config management (requires main auth):
 *   POST   /api/scim/config   — generate SCIM bearer token
 *   DELETE /api/scim/config   — revoke SCIM bearer token
 */
import { createHash, randomBytes } from "node:crypto";
import { requireApiKeyResponse, getAuthContext } from "../auth-api-key.js";
import { database } from "../state.js";
import { asString, readJsonBody } from "../helpers.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { mapleLog } from "../logging.js";

// ── Table bootstrap ─────────────────────────────────────────────────────────

async function ensureScimTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scim_configurations (
      org_id TEXT PRIMARY KEY,
      bearer_token_hash TEXT NOT NULL,
      enabled BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Add SCIM + profile columns to users table (idempotent)
  await pool.query(`
    DO $$
    BEGIN
      ALTER TABLE users ADD COLUMN IF NOT EXISTS scim_external_id TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS scim_active BOOLEAN DEFAULT TRUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS given_name TEXT DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS family_name TEXT DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT '';
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END $$;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_scim_external_id
      ON users(scim_external_id)
      WHERE scim_external_id IS NOT NULL
  `).catch(() => {});
}

let _tableEnsured = false;

// ── Rate limiter ────────────────────────────────────────────────────────────

const rateLimitBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;

function checkRateLimit(orgId) {
  const now = Date.now();
  let bucket = rateLimitBuckets.get(orgId);

  if (!bucket || (now - bucket.windowStart) > RATE_LIMIT_WINDOW_MS) {
    bucket = { windowStart: now, count: 0 };
    rateLimitBuckets.set(orgId, bucket);
  }

  bucket.count++;
  return bucket.count <= RATE_LIMIT_MAX;
}

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets) {
    if ((now - bucket.windowStart) > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitBuckets.delete(key);
    }
  }
}, 120_000).unref();

// ── SCIM bearer token auth middleware ───────────────────────────────────────

async function requireScimBearerToken(c, pool) {
  const authorization = c.req.header("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return { error: "SCIM bearer token required.", status: 401, orgId: null };
  }

  const token = authorization.slice(7).trim();
  if (!token) {
    return { error: "Empty bearer token.", status: 401, orgId: null };
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  try {
    const result = await pool.query(
      `SELECT org_id, enabled FROM scim_configurations WHERE bearer_token_hash = $1 LIMIT 1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return { error: "Invalid SCIM bearer token.", status: 401, orgId: null };
    }

    if (!result.rows[0].enabled) {
      return { error: "SCIM integration is disabled for this organization.", status: 403, orgId: null };
    }

    return { error: null, status: null, orgId: result.rows[0].org_id };
  } catch (err) {
    mapleLog("error", "scim.auth_failed", { error: err.message });
    return { error: "SCIM authentication failed.", status: 500, orgId: null };
  }
}

// ── SCIM schema / formatting helpers ────────────────────────────────────────

const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";

function formatScimUser(user, baseUrl) {
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: user.id,
    externalId: user.scim_external_id || user.id,
    userName: user.username || user.email,
    name: {
      givenName: user.given_name || user.username || "",
      familyName: user.family_name || "",
      formatted: user.display_name || user.username || "",
    },
    displayName: user.display_name || user.username || "",
    emails: user.email ? [{
      value: user.email,
      type: "work",
      primary: true,
    }] : [],
    active: user.scim_active !== false,
    meta: {
      resourceType: "User",
      created: user.created_at,
      lastModified: user.updated_at || user.created_at,
      location: `${baseUrl}/scim/v2/Users/${user.id}`,
    },
  };
}

function scimError(c, status, detail) {
  return c.json({
    schemas: [SCIM_ERROR_SCHEMA],
    detail,
    status,
  }, status);
}

function getBaseUrl(c) {
  const proto = c.req.header("x-forwarded-proto") || "https";
  const host = c.req.header("host") || "localhost";
  return `${proto}://${host}`;
}

/**
 * Parse basic SCIM filter expressions.
 * Supports: `userName eq "value"` and `externalId eq "value"`.
 */
function parseScimFilter(filter) {
  if (!filter) return null;

  const match = filter.match(/^(\w+)\s+eq\s+"([^"]+)"$/i);
  if (!match) return null;

  const [, attribute, value] = match;
  const attrMap = {
    username: "username",
    externalid: "scim_external_id",
    email: "email",
  };

  const column = attrMap[attribute.toLowerCase()];
  if (!column) return null;

  return { column, value };
}

// ── Route registration ──────────────────────────────────────────────────────

export function registerScimRoutes(app) {

  // ════════════════════════════════════════════════════════════════════════
  // SCIM 2.0 Discovery Endpoints
  // ════════════════════════════════════════════════════════════════════════

  app.get("/scim/v2/ServiceProviderConfig", (c) => {
    return c.json({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
      documentationUri: "https://docs.maple.dev/scim",
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: "oauthbearertoken",
          name: "OAuth Bearer Token",
          description: "Authentication via bearer token issued through /api/scim/config",
        },
      ],
    });
  });

  app.get("/scim/v2/Schemas", (c) => {
    return c.json({
      schemas: [SCIM_LIST_SCHEMA],
      totalResults: 1,
      Resources: [
        {
          id: SCIM_USER_SCHEMA,
          name: "User",
          description: "User Account",
          attributes: [
            { name: "userName", type: "string", multiValued: false, required: true, mutability: "readWrite", uniqueness: "server" },
            { name: "name", type: "complex", multiValued: false, required: false, mutability: "readWrite", subAttributes: [
              { name: "givenName", type: "string", multiValued: false, required: false, mutability: "readWrite" },
              { name: "familyName", type: "string", multiValued: false, required: false, mutability: "readWrite" },
              { name: "formatted", type: "string", multiValued: false, required: false, mutability: "readWrite" },
            ]},
            { name: "displayName", type: "string", multiValued: false, required: false, mutability: "readWrite" },
            { name: "emails", type: "complex", multiValued: true, required: false, mutability: "readWrite", subAttributes: [
              { name: "value", type: "string", multiValued: false, required: true, mutability: "readWrite" },
              { name: "type", type: "string", multiValued: false, required: false, mutability: "readWrite" },
              { name: "primary", type: "boolean", multiValued: false, required: false, mutability: "readWrite" },
            ]},
            { name: "active", type: "boolean", multiValued: false, required: false, mutability: "readWrite" },
            { name: "externalId", type: "string", multiValued: false, required: false, mutability: "readWrite" },
          ],
          meta: { resourceType: "Schema", location: "/scim/v2/Schemas/" + SCIM_USER_SCHEMA },
        },
      ],
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SCIM 2.0 User Resource Endpoints
  // ════════════════════════════════════════════════════════════════════════

  // ── List Users ────────────────────────────────────────────────────────
  app.get("/scim/v2/Users", async (c) => {
    const pool = database?.pool;
    if (!pool) return scimError(c, 503, "Database unavailable.");

    if (!_tableEnsured) { await ensureScimTables(pool); _tableEnsured = true; }

    const auth = await requireScimBearerToken(c, pool);
    if (auth.error) return scimError(c, auth.status, auth.error);
    if (!checkRateLimit(auth.orgId)) return scimError(c, 429, "Rate limit exceeded. Maximum 100 requests per minute.");

    const baseUrl = getBaseUrl(c);
    const filter = c.req.query("filter");
    const startIndex = Math.max(1, Number(c.req.query("startIndex")) || 1);
    const count = Math.min(200, Math.max(1, Number(c.req.query("count")) || 100));
    const offset = startIndex - 1;

    try {
      const parsedFilter = parseScimFilter(filter);
      let query, params;

      if (parsedFilter) {
        query = `SELECT * FROM users WHERE ${parsedFilter.column} = $1 ORDER BY created_at LIMIT $2 OFFSET $3`;
        params = [parsedFilter.value, count, offset];
      } else {
        query = `SELECT * FROM users ORDER BY created_at LIMIT $1 OFFSET $2`;
        params = [count, offset];
      }

      const result = await pool.query(query, params);

      const countQuery = parsedFilter
        ? `SELECT COUNT(*)::int AS total FROM users WHERE ${parsedFilter.column} = $1`
        : `SELECT COUNT(*)::int AS total FROM users`;
      const countParams = parsedFilter ? [parsedFilter.value] : [];
      const totalResult = await pool.query(countQuery, countParams);
      const totalResults = totalResult.rows[0]?.total ?? 0;

      return c.json({
        schemas: [SCIM_LIST_SCHEMA],
        totalResults,
        startIndex,
        itemsPerPage: result.rows.length,
        Resources: result.rows.map((u) => formatScimUser(u, baseUrl)),
      });
    } catch (err) {
      mapleLog("error", "scim.list_users_failed", { error: err.message });
      return scimError(c, 500, "Failed to list users.");
    }
  });

  // ── Get User ──────────────────────────────────────────────────────────
  app.get("/scim/v2/Users/:id", async (c) => {
    const pool = database?.pool;
    if (!pool) return scimError(c, 503, "Database unavailable.");

    if (!_tableEnsured) { await ensureScimTables(pool); _tableEnsured = true; }

    const auth = await requireScimBearerToken(c, pool);
    if (auth.error) return scimError(c, auth.status, auth.error);
    if (!checkRateLimit(auth.orgId)) return scimError(c, 429, "Rate limit exceeded.");

    const userId = asString(c.req.param("id"));
    const baseUrl = getBaseUrl(c);

    try {
      const result = await pool.query(
        `SELECT * FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return scimError(c, 404, "User not found.");
      }

      return c.json(formatScimUser(result.rows[0], baseUrl));
    } catch (err) {
      mapleLog("error", "scim.get_user_failed", { userId, error: err.message });
      return scimError(c, 500, "Failed to get user.");
    }
  });

  // ── Create User ───────────────────────────────────────────────────────
  app.post("/scim/v2/Users", async (c) => {
    const pool = database?.pool;
    if (!pool) return scimError(c, 503, "Database unavailable.");

    if (!_tableEnsured) { await ensureScimTables(pool); _tableEnsured = true; }

    const auth = await requireScimBearerToken(c, pool);
    if (auth.error) return scimError(c, auth.status, auth.error);
    if (!checkRateLimit(auth.orgId)) return scimError(c, 429, "Rate limit exceeded.");

    const body = await readJsonBody(c);
    const baseUrl = getBaseUrl(c);

    const userName = asString(body.userName);
    if (!userName) return scimError(c, 400, "userName is required.");

    const email = body.emails?.[0]?.value || userName;
    const givenName = body.name?.givenName || "";
    const familyName = body.name?.familyName || "";
    const displayName = asString(body.displayName) || body.name?.formatted || userName;
    const externalId = asString(body.externalId) || null;
    const active = body.active !== false;

    try {
      // Check for duplicate
      const existing = await pool.query(
        `SELECT id FROM users WHERE username = $1 OR email = $2 LIMIT 1`,
        [userName, email]
      );
      if (existing.rows.length > 0) {
        return scimError(c, 409, "User with this userName already exists.");
      }

      // Generate a random password (SCIM-provisioned users typically use SSO)
      const randomPassword = randomBytes(32).toString("hex");
      const passwordHash = createHash("sha256").update(randomPassword).digest("hex");
      const normalizedUsername = userName.trim().toLowerCase();
      const userId = randomBytes(16).toString("hex");
      const now = new Date().toISOString();

      // Resolve default "member" RBAC role for automatic assignment
      let defaultRoleId = null;
      try {
        const roleResult = await pool.query(
          `SELECT role_id FROM custom_roles WHERE label = 'member' AND is_system = TRUE AND org_id IS NULL LIMIT 1`
        );
        if (roleResult.rows.length > 0) defaultRoleId = roleResult.rows[0].role_id;
      } catch { /* custom_roles may not exist */ }

      const result = await pool.query(
        `INSERT INTO users (id, username, normalized_username, email, password_hash, given_name, family_name, display_name, scim_external_id, scim_active, role, custom_role_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'user', $11, $12, $12)
         RETURNING *`,
        [userId, userName, normalizedUsername, email, passwordHash, givenName, familyName, displayName, externalId, active, defaultRoleId, now]
      );

      const user = result.rows[0];

      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_SCIM_USER_CREATED",
        sourceService: "gateway-api",
        severity: "RISK_SEVERITY_MEDIUM",
        summary: `SCIM: User '${userName}' provisioned`,
        payload: { userId: user.id, userName, orgId: auth.orgId, externalId },
      });

      mapleLog("info", "scim.user_created", { userId: user.id, userName });

      c.status(201);
      return c.json(formatScimUser(user, baseUrl));
    } catch (err) {
      mapleLog("error", "scim.create_user_failed", { userName, error: err.message });
      return scimError(c, 500, "Failed to create user.");
    }
  });

  // ── Replace User (PUT) ────────────────────────────────────────────────
  app.put("/scim/v2/Users/:id", async (c) => {
    const pool = database?.pool;
    if (!pool) return scimError(c, 503, "Database unavailable.");

    if (!_tableEnsured) { await ensureScimTables(pool); _tableEnsured = true; }

    const auth = await requireScimBearerToken(c, pool);
    if (auth.error) return scimError(c, auth.status, auth.error);
    if (!checkRateLimit(auth.orgId)) return scimError(c, 429, "Rate limit exceeded.");

    const userId = asString(c.req.param("id"));
    const body = await readJsonBody(c);
    const baseUrl = getBaseUrl(c);

    try {
      const existing = await pool.query(
        `SELECT id FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      if (existing.rows.length === 0) {
        return scimError(c, 404, "User not found.");
      }

      const userName = asString(body.userName) || null;
      const email = body.emails?.[0]?.value || userName;
      const givenName = body.name?.givenName || "";
      const familyName = body.name?.familyName || "";
      const displayName = asString(body.displayName) || body.name?.formatted || userName || "";
      const externalId = asString(body.externalId) || null;
      const active = body.active !== false;

      const result = await pool.query(
        `UPDATE users SET
           username = COALESCE($1, username),
           email = COALESCE($2, email),
           given_name = $3,
           family_name = $4,
           display_name = $5,
           scim_external_id = $6,
           scim_active = $7,
           updated_at = NOW()
         WHERE id = $8
         RETURNING *`,
        [userName, email, givenName, familyName, displayName, externalId, active, userId]
      );

      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_SCIM_USER_REPLACED",
        sourceService: "gateway-api",
        severity: "RISK_SEVERITY_MEDIUM",
        summary: `SCIM: User '${userId}' replaced`,
        payload: { userId, orgId: auth.orgId, userName },
      });

      return c.json(formatScimUser(result.rows[0], baseUrl));
    } catch (err) {
      mapleLog("error", "scim.replace_user_failed", { userId, error: err.message });
      return scimError(c, 500, "Failed to replace user.");
    }
  });

  // ── Partial Update User (PATCH) ───────────────────────────────────────
  app.patch("/scim/v2/Users/:id", async (c) => {
    const pool = database?.pool;
    if (!pool) return scimError(c, 503, "Database unavailable.");

    if (!_tableEnsured) { await ensureScimTables(pool); _tableEnsured = true; }

    const auth = await requireScimBearerToken(c, pool);
    if (auth.error) return scimError(c, auth.status, auth.error);
    if (!checkRateLimit(auth.orgId)) return scimError(c, 429, "Rate limit exceeded.");

    const userId = asString(c.req.param("id"));
    const body = await readJsonBody(c);
    const baseUrl = getBaseUrl(c);

    try {
      const existing = await pool.query(
        `SELECT * FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      if (existing.rows.length === 0) {
        return scimError(c, 404, "User not found.");
      }

      // SCIM PATCH uses Operations array
      const operations = body.Operations || body.operations || [];
      const updates = [];
      const values = [];
      let idx = 1;

      for (const op of operations) {
        const operation = (op.op || "").toLowerCase();
        const path = (op.path || "").toLowerCase();
        const value = op.value;

        if (operation === "replace" || operation === "add") {
          if (path === "active" || (!path && value?.active !== undefined)) {
            const activeVal = path ? value : value.active;
            updates.push(`scim_active = $${idx++}`);
            values.push(activeVal === true || activeVal === "true");
          }
          if (path === "username" || (!path && value?.userName !== undefined)) {
            const userNameVal = path ? value : value.userName;
            updates.push(`username = $${idx++}`);
            values.push(String(userNameVal));
          }
          if (path === "displayname" || (!path && value?.displayName !== undefined)) {
            const dnVal = path ? value : value.displayName;
            updates.push(`display_name = $${idx++}`);
            values.push(String(dnVal));
          }
          if (path === "externalid" || (!path && value?.externalId !== undefined)) {
            const eidVal = path ? value : value.externalId;
            updates.push(`scim_external_id = $${idx++}`);
            values.push(String(eidVal));
          }
          if (path === "name.givenname" || (!path && value?.name?.givenName !== undefined)) {
            const gnVal = path ? value : value.name.givenName;
            updates.push(`given_name = $${idx++}`);
            values.push(String(gnVal));
          }
          if (path === "name.familyname" || (!path && value?.name?.familyName !== undefined)) {
            const fnVal = path ? value : value.name.familyName;
            updates.push(`family_name = $${idx++}`);
            values.push(String(fnVal));
          }
          if (path === "emails" || path === "emails[type eq \"work\"].value" || (!path && value?.emails)) {
            const emailVal = path ? (Array.isArray(value) ? value[0]?.value : value) : value.emails?.[0]?.value;
            if (emailVal) {
              updates.push(`email = $${idx++}`);
              values.push(String(emailVal));
            }
          }
        }
      }

      if (updates.length === 0) {
        // No-op PATCH is valid in SCIM
        return c.json(formatScimUser(existing.rows[0], baseUrl));
      }

      updates.push(`updated_at = NOW()`);
      values.push(userId);

      const result = await pool.query(
        `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );

      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_SCIM_USER_PATCHED",
        sourceService: "gateway-api",
        severity: "RISK_SEVERITY_MEDIUM",
        summary: `SCIM: User '${userId}' patched (${operations.length} operations)`,
        payload: { userId, orgId: auth.orgId, operationCount: operations.length },
      });

      return c.json(formatScimUser(result.rows[0], baseUrl));
    } catch (err) {
      mapleLog("error", "scim.patch_user_failed", { userId, error: err.message });
      return scimError(c, 500, "Failed to patch user.");
    }
  });

  // ── Delete User (deactivate) ──────────────────────────────────────────
  app.delete("/scim/v2/Users/:id", async (c) => {
    const pool = database?.pool;
    if (!pool) return scimError(c, 503, "Database unavailable.");

    if (!_tableEnsured) { await ensureScimTables(pool); _tableEnsured = true; }

    const auth = await requireScimBearerToken(c, pool);
    if (auth.error) return scimError(c, auth.status, auth.error);
    if (!checkRateLimit(auth.orgId)) return scimError(c, 429, "Rate limit exceeded.");

    const userId = asString(c.req.param("id"));

    try {
      const existing = await pool.query(
        `SELECT id, username FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      if (existing.rows.length === 0) {
        return scimError(c, 404, "User not found.");
      }

      // Deactivate rather than hard-delete (SCIM best practice)
      await pool.query(
        `UPDATE users SET scim_active = FALSE, updated_at = NOW() WHERE id = $1`,
        [userId]
      );

      // Revoke all active sessions for the deactivated user
      await pool.query(
        `DELETE FROM sessions WHERE user_id = $1`,
        [userId]
      ).catch(() => {});

      // Revoke API keys
      await pool.query(
        `UPDATE business_user_api_keys SET expires_at = NOW() WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
        [userId]
      ).catch(() => {});

      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_SCIM_USER_DEACTIVATED",
        sourceService: "gateway-api",
        severity: "RISK_SEVERITY_HIGH",
        summary: `SCIM: User '${existing.rows[0].username}' deactivated and sessions revoked`,
        payload: { userId, orgId: auth.orgId, username: existing.rows[0].username },
      });

      mapleLog("warn", "scim.user_deactivated", { userId, username: existing.rows[0].username });

      // SCIM expects 204 No Content on successful delete
      return c.body(null, 204);
    } catch (err) {
      mapleLog("error", "scim.delete_user_failed", { userId, error: err.message });
      return scimError(c, 500, "Failed to deactivate user.");
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // SCIM Configuration Management (requires main auth)
  // ════════════════════════════════════════════════════════════════════════

  // ── Generate SCIM bearer token ────────────────────────────────────────
  app.post("/api/scim/config", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const pool = database?.pool;
    if (!pool) return c.json({ error: "Database unavailable." }, 503);

    if (!_tableEnsured) { await ensureScimTables(pool); _tableEnsured = true; }

    const authCtx = getAuthContext(c);
    const body = await readJsonBody(c);
    const orgId = asString(body.orgId) || "default";

    // Generate a cryptographically secure bearer token
    const token = `scim_${randomBytes(32).toString("hex")}`;
    const tokenHash = createHash("sha256").update(token).digest("hex");

    try {
      await pool.query(
        `INSERT INTO scim_configurations (org_id, bearer_token_hash, enabled)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (org_id) DO UPDATE SET
           bearer_token_hash = EXCLUDED.bearer_token_hash,
           enabled = TRUE,
           updated_at = NOW()`,
        [orgId, tokenHash]
      );

      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_SCIM_CONFIG_CREATED",
        sourceService: "gateway-api",
        userId: authCtx?.userId,
        severity: "RISK_SEVERITY_HIGH",
        summary: `SCIM bearer token generated for org '${orgId}'`,
        payload: { orgId, createdBy: authCtx?.userId },
      });

      mapleLog("info", "scim.config_created", { orgId });

      return c.json({
        ok: true,
        orgId,
        token,
        note: "Store this token securely. It will not be shown again.",
        endpoints: {
          users: "/scim/v2/Users",
          serviceProviderConfig: "/scim/v2/ServiceProviderConfig",
          schemas: "/scim/v2/Schemas",
        },
      }, 201);
    } catch (err) {
      mapleLog("error", "scim.config_create_failed", { orgId, error: err.message });
      return c.json({ error: "Failed to create SCIM configuration", details: err.message }, 500);
    }
  });

  // ── Revoke SCIM bearer token ──────────────────────────────────────────
  app.delete("/api/scim/config", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const pool = database?.pool;
    if (!pool) return c.json({ error: "Database unavailable." }, 503);

    if (!_tableEnsured) { await ensureScimTables(pool); _tableEnsured = true; }

    const authCtx = getAuthContext(c);
    const orgId = c.req.query("orgId") || "default";

    try {
      const result = await pool.query(
        `UPDATE scim_configurations SET enabled = FALSE, updated_at = NOW() WHERE org_id = $1 RETURNING org_id`,
        [orgId]
      );

      if (result.rows.length === 0) {
        return c.json({ error: "No SCIM configuration found for this organization." }, 404);
      }

      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_SCIM_CONFIG_REVOKED",
        sourceService: "gateway-api",
        userId: authCtx?.userId,
        severity: "RISK_SEVERITY_HIGH",
        summary: `SCIM bearer token revoked for org '${orgId}'`,
        payload: { orgId, revokedBy: authCtx?.userId },
      });

      mapleLog("warn", "scim.config_revoked", { orgId });

      return c.json({ ok: true, orgId, status: "revoked" });
    } catch (err) {
      mapleLog("error", "scim.config_revoke_failed", { orgId, error: err.message });
      return c.json({ error: "Failed to revoke SCIM configuration", details: err.message }, 500);
    }
  });
}
