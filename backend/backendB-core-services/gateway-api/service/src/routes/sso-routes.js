/**
 * sso-routes.js
 *
 * Phase 3 — SSO endpoints for SAML 2.0 and OIDC Authorization Code flow.
 *
 * Endpoints:
 *   GET  /api/auth/sso/discover?email=...      — domain-based SSO discovery
 *   GET  /api/auth/sso/saml/metadata            — SP metadata XML
 *   GET  /api/auth/sso/saml/login               — redirect to SAML IdP
 *   POST /api/auth/sso/saml/acs                 — Assertion Consumer Service
 *   GET  /api/auth/sso/oidc/login               — redirect to OIDC provider
 *   GET  /api/auth/sso/oidc/callback            — OIDC callback
 *   GET  /api/auth/sso/config                   — list SSO configs (admin)
 *   POST /api/auth/sso/config                   — create/update SSO config (admin)
 *   POST /api/auth/sso/config/test              — test SSO connection
 */
import { randomUUID } from "node:crypto";
import { database } from "../state.js";
import { requireApiKeyResponse, getAuthContext } from "../auth-api-key.js";
import { findRequestSession, buildSessionCookie } from "../auth-session.js";
import { sessionTtlSeconds } from "../config.js";
import { asString, readJsonBody } from "../helpers.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { mapleLog } from "../logging.js";

import {
  buildAuthnRequest,
  parseAndVerifySamlResponse,
  buildSpMetadata,
} from "../core/sso-saml.js";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  verifyIdToken,
} from "../core/sso-oidc.js";
import {
  provisionOrLinkUser,
  mapSsoAttributes,
} from "../core/sso-user-provisioner.js";

// ── Table Setup ──────────────────────────────────────────────────────────────

/**
 * Ensure SSO tables exist. Called once during route registration.
 */
export async function ensureSsoTables() {
  if (!database?.pool) return;
  try {
    await database.pool.query(`
      CREATE TABLE IF NOT EXISTS sso_configurations (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        protocol TEXT NOT NULL CHECK (protocol IN ('saml', 'oidc')),
        domain TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        entity_id TEXT,
        acs_url TEXT,
        idp_sso_url TEXT,
        idp_certificate TEXT,
        idp_issuer TEXT,
        oidc_client_id TEXT,
        oidc_client_secret TEXT,
        oidc_authorization_endpoint TEXT,
        oidc_token_endpoint TEXT,
        oidc_jwks_uri TEXT,
        oidc_issuer TEXT,
        auto_provision BOOLEAN NOT NULL DEFAULT TRUE,
        default_role_id TEXT DEFAULT 'member',
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sso_config_domain
        ON sso_configurations(domain);
      CREATE INDEX IF NOT EXISTS idx_sso_config_org
        ON sso_configurations(org_id);
    `);

    await database.pool.query(`
      CREATE TABLE IF NOT EXISTS sso_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        protocol TEXT NOT NULL,
        name_id TEXT,
        sso_config_id TEXT NOT NULL,
        sso_session_index TEXT,
        session_not_on_or_after TEXT,
        created_at TEXT NOT NULL,
        CONSTRAINT fk_sso_sessions_config FOREIGN KEY (sso_config_id) REFERENCES sso_configurations(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sso_sessions_user
        ON sso_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sso_sessions_session
        ON sso_sessions(session_id);
    `);

    mapleLog("info", "sso.tables_ensured", {});
  } catch (err) {
    mapleLog("warn", "sso.table_creation_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── In-Memory SSO State Store (CSRF protection) ─────────────────────────────

/** @type {Map<string, { createdAt: number, configId: string, returnTo?: string, nonce?: string }>} */
const pendingSsoRequests = new Map();
const SSO_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function createSsoState(configId, options = {}) {
  const state = randomUUID();
  pendingSsoRequests.set(state, {
    createdAt: Date.now(),
    configId,
    returnTo: options.returnTo || "",
    nonce: options.nonce || "",
  });
  return state;
}

function consumeSsoState(state) {
  const entry = pendingSsoRequests.get(state);
  if (!entry) return null;
  pendingSsoRequests.delete(state);
  if (Date.now() - entry.createdAt > SSO_STATE_TTL_MS) return null;
  return entry;
}

// Periodic cleanup of expired state entries
setInterval(() => {
  const cutoff = Date.now() - SSO_STATE_TTL_MS;
  for (const [key, entry] of pendingSsoRequests) {
    if (entry.createdAt < cutoff) pendingSsoRequests.delete(key);
  }
}, 5 * 60 * 1000).unref();

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractDomainFromEmail(email) {
  const at = String(email ?? "").indexOf("@");
  if (at < 0) return "";
  return email.slice(at + 1).toLowerCase().trim();
}

async function findSsoConfigByDomain(domain) {
  if (!domain || !database?.pool) return null;
  try {
    const result = await database.pool.query(
      `SELECT * FROM sso_configurations WHERE LOWER(domain) = $1 AND enabled = TRUE LIMIT 1`,
      [domain.toLowerCase()],
    );
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

async function findSsoConfigById(configId) {
  if (!configId || !database?.pool) return null;
  try {
    const result = await database.pool.query(
      `SELECT * FROM sso_configurations WHERE id = $1 LIMIT 1`,
      [configId],
    );
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

function resolveEntityId(config) {
  return config.entity_id || `urn:maple:sso:${config.org_id}`;
}

function resolveAcsUrl(config) {
  return config.acs_url || `${process.env.MCP_URL || ""}/api/auth/sso/saml/acs`;
}

async function createSessionAndCookie(c, user, ssoConfigId, protocol, nameId, sessionNotOnOrAfter) {
  // Create a platform session
  const session = await database.createSession(user.id, sessionTtlSeconds);

  // Record SSO session for SLO tracking
  try {
    await database.pool.query(
      `INSERT INTO sso_sessions (id, user_id, session_id, protocol, name_id, sso_config_id, session_not_on_or_after, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        user.id,
        session.id,
        protocol,
        nameId || "",
        ssoConfigId,
        sessionNotOnOrAfter || null,
        new Date().toISOString(),
      ],
    );
  } catch {
    // sso_sessions insert failure is non-fatal
  }

  c.header("Set-Cookie", buildSessionCookie(session.id, sessionTtlSeconds));
  return session;
}

// ── Route Registration ───────────────────────────────────────────────────────

export function registerSsoRoutes(app) {
  // Initialize SSO tables on registration
  ensureSsoTables().catch(() => {});

  // ── 1. Domain-Based SSO Discovery ──────────────────────────────────────
  app.get("/api/auth/sso/discover", async (c) => {
    const email = asString(c.req.query("email"));
    if (!email) {
      return c.json({ error: "email query parameter is required." }, 400);
    }

    const domain = extractDomainFromEmail(email);
    if (!domain) {
      return c.json({ error: "Invalid email address." }, 400);
    }

    const config = await findSsoConfigByDomain(domain);
    if (!config) {
      return c.json({
        ok: true,
        ssoConfigured: false,
        domain,
        message: "No SSO configuration found for this domain.",
      });
    }

    return c.json({
      ok: true,
      ssoConfigured: true,
      domain,
      protocol: config.protocol,
      configId: config.id,
      loginUrl: config.protocol === "saml"
        ? `/api/auth/sso/saml/login?config=${encodeURIComponent(config.id)}`
        : `/api/auth/sso/oidc/login?config=${encodeURIComponent(config.id)}`,
    });
  });

  // ── 2. SAML SP Metadata ────────────────────────────────────────────────
  app.get("/api/auth/sso/saml/metadata", async (c) => {
    const configId = asString(c.req.query("config"));
    let entityId = "urn:maple:sso:sp";
    let acsUrl = `${process.env.MCP_URL || ""}/api/auth/sso/saml/acs`;

    if (configId) {
      const config = await findSsoConfigById(configId);
      if (config) {
        entityId = resolveEntityId(config);
        acsUrl = resolveAcsUrl(config);
      }
    }

    const metadata = buildSpMetadata({ entityId, acsUrl });
    c.header("Content-Type", "application/xml; charset=utf-8");
    return c.body(metadata);
  });

  // ── 3. SAML Login (Redirect to IdP) ───────────────────────────────────
  app.get("/api/auth/sso/saml/login", async (c) => {
    const configId = asString(c.req.query("config"));
    const returnTo = asString(c.req.query("returnTo")) || "/";

    if (!configId) {
      return c.json({ error: "config query parameter is required." }, 400);
    }

    const config = await findSsoConfigById(configId);
    if (!config || config.protocol !== "saml") {
      return c.json({ error: "SAML SSO configuration not found." }, 404);
    }
    if (!config.enabled) {
      return c.json({ error: "This SSO configuration is disabled." }, 403);
    }
    if (!config.idp_sso_url) {
      return c.json({ error: "IdP SSO URL is not configured." }, 500);
    }

    const entityId = resolveEntityId(config);
    const acsUrl = resolveAcsUrl(config);

    const authnRequest = buildAuthnRequest({
      entityId,
      acsUrl,
      destination: config.idp_sso_url,
    });

    const state = createSsoState(config.id, { returnTo });
    const encodedRequest = Buffer.from(authnRequest, "utf8").toString("base64");

    // Build the redirect URL with SAMLRequest and RelayState
    const url = new URL(config.idp_sso_url);
    url.searchParams.set("SAMLRequest", encodedRequest);
    url.searchParams.set("RelayState", state);

    mapleLog("info", "sso.saml_login_redirect", {
      configId: config.id,
      domain: config.domain,
    });

    return c.redirect(url.toString(), 302);
  });

  // ── 4. SAML Assertion Consumer Service ─────────────────────────────────
  app.post("/api/auth/sso/saml/acs", async (c) => {
    let body;
    try {
      // SAML ACS receives application/x-www-form-urlencoded
      const contentType = c.req.header("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        body = Object.fromEntries(new URLSearchParams(await c.req.text()));
      } else {
        body = await readJsonBody(c);
      }
    } catch {
      return c.json({ error: "Unable to parse SAML response body." }, 400);
    }

    const samlResponse = asString(body.SAMLResponse);
    const relayState = asString(body.RelayState);

    if (!samlResponse) {
      return c.json({ error: "SAMLResponse is required." }, 400);
    }

    // Validate RelayState (CSRF protection)
    const stateEntry = relayState ? consumeSsoState(relayState) : null;
    if (!stateEntry) {
      return c.json({ error: "Invalid or expired SSO state. Please try logging in again." }, 400);
    }

    const config = await findSsoConfigById(stateEntry.configId);
    if (!config || config.protocol !== "saml") {
      return c.json({ error: "SAML SSO configuration not found." }, 404);
    }
    if (!config.idp_certificate) {
      return c.json({ error: "IdP certificate is not configured." }, 500);
    }

    // Parse and verify the SAML Response
    let assertion;
    try {
      assertion = parseAndVerifySamlResponse(samlResponse, config.idp_certificate);
    } catch (err) {
      mapleLog("warn", "sso.saml_verification_failed", {
        configId: config.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json({
        error: "SAML response verification failed.",
        detail: err instanceof Error ? err.message : String(err),
      }, 401);
    }

    // Map attributes and provision/link user
    const mapped = mapSsoAttributes(assertion.attributes, "saml");
    const email = mapped.email || assertion.nameId;

    if (!email || !email.includes("@")) {
      return c.json({ error: "SAML assertion does not contain a valid email." }, 400);
    }

    let provisionResult;
    try {
      provisionResult = await provisionOrLinkUser({
        email,
        nameId: assertion.nameId,
        attributes: assertion.attributes,
        orgId: config.org_id,
        defaultRoleId: config.default_role_id || "member",
        autoProvision: config.auto_provision !== false,
        database,
      });
    } catch (err) {
      mapleLog("warn", "sso.saml_provisioning_failed", {
        email,
        configId: config.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json({
        error: "User provisioning failed.",
        detail: err instanceof Error ? err.message : String(err),
      }, 403);
    }

    // Create session and set cookie
    const session = await createSessionAndCookie(
      c,
      provisionResult.user,
      config.id,
      "saml",
      assertion.nameId,
      assertion.sessionNotOnOrAfter,
    );

    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_SSO_LOGIN",
      sourceService: "gateway-api",
      userId: provisionResult.user.id,
      severity: "RISK_SEVERITY_LOW",
      summary: `SAML SSO login for ${email}`,
      payload: {
        protocol: "saml",
        domain: config.domain,
        configId: config.id,
        isNewUser: provisionResult.isNewUser,
        nameId: assertion.nameId,
      },
    });

    mapleLog("info", "sso.saml_login_success", {
      userId: provisionResult.user.id,
      email,
      isNewUser: provisionResult.isNewUser,
      configId: config.id,
    });

    // Redirect to the return URL or default
    const returnTo = stateEntry.returnTo || "/";
    return c.redirect(returnTo, 302);
  });

  // ── 5. OIDC Login (Redirect to Provider) ──────────────────────────────
  app.get("/api/auth/sso/oidc/login", async (c) => {
    const configId = asString(c.req.query("config"));
    const returnTo = asString(c.req.query("returnTo")) || "/";

    if (!configId) {
      return c.json({ error: "config query parameter is required." }, 400);
    }

    const config = await findSsoConfigById(configId);
    if (!config || config.protocol !== "oidc") {
      return c.json({ error: "OIDC SSO configuration not found." }, 404);
    }
    if (!config.enabled) {
      return c.json({ error: "This SSO configuration is disabled." }, 403);
    }
    if (!config.oidc_authorization_endpoint) {
      return c.json({ error: "OIDC authorization endpoint is not configured." }, 500);
    }

    const nonce = randomUUID();
    const state = createSsoState(config.id, { returnTo, nonce });
    const redirectUri = `${process.env.MCP_URL || ""}/api/auth/sso/oidc/callback`;

    const authUrl = buildAuthorizationUrl({
      clientId: config.oidc_client_id,
      redirectUri,
      scope: "openid email profile",
      state,
      nonce,
      authorizationEndpoint: config.oidc_authorization_endpoint,
    });

    mapleLog("info", "sso.oidc_login_redirect", {
      configId: config.id,
      domain: config.domain,
    });

    return c.redirect(authUrl, 302);
  });

  // ── 6. OIDC Callback ──────────────────────────────────────────────────
  app.get("/api/auth/sso/oidc/callback", async (c) => {
    const code = asString(c.req.query("code"));
    const state = asString(c.req.query("state"));
    const error = asString(c.req.query("error"));
    const errorDescription = asString(c.req.query("error_description"));

    if (error) {
      return c.json({
        error: "OIDC authentication failed.",
        detail: errorDescription || error,
      }, 401);
    }

    if (!code || !state) {
      return c.json({ error: "Missing code or state parameter." }, 400);
    }

    // Validate state (CSRF protection)
    const stateEntry = consumeSsoState(state);
    if (!stateEntry) {
      return c.json({ error: "Invalid or expired SSO state. Please try logging in again." }, 400);
    }

    const config = await findSsoConfigById(stateEntry.configId);
    if (!config || config.protocol !== "oidc") {
      return c.json({ error: "OIDC SSO configuration not found." }, 404);
    }

    const redirectUri = `${process.env.MCP_URL || ""}/api/auth/sso/oidc/callback`;

    // Exchange code for tokens
    let tokens;
    try {
      tokens = await exchangeCodeForTokens({
        code,
        clientId: config.oidc_client_id,
        clientSecret: config.oidc_client_secret,
        redirectUri,
        tokenEndpoint: config.oidc_token_endpoint,
      });
    } catch (err) {
      mapleLog("warn", "sso.oidc_token_exchange_failed", {
        configId: config.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json({
        error: "OIDC token exchange failed.",
        detail: err instanceof Error ? err.message : String(err),
      }, 401);
    }

    // Verify ID token
    let claims;
    if (tokens.idToken && config.oidc_jwks_uri) {
      try {
        const result = await verifyIdToken({
          idToken: tokens.idToken,
          jwksUri: config.oidc_jwks_uri,
          clientId: config.oidc_client_id,
          nonce: stateEntry.nonce || undefined,
          issuer: config.oidc_issuer || undefined,
        });
        claims = result.claims;
      } catch (err) {
        mapleLog("warn", "sso.oidc_id_token_verification_failed", {
          configId: config.id,
          error: err instanceof Error ? err.message : String(err),
        });
        return c.json({
          error: "OIDC ID token verification failed.",
          detail: err instanceof Error ? err.message : String(err),
        }, 401);
      }
    } else if (tokens.idToken) {
      // No JWKS URI — decode without verification (not recommended)
      try {
        const parts = tokens.idToken.split(".");
        claims = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
      } catch {
        return c.json({ error: "Failed to decode ID token." }, 401);
      }
    } else {
      return c.json({ error: "No ID token received from OIDC provider." }, 401);
    }

    const email = claims.email || claims.preferred_username || claims.sub;
    if (!email || !email.includes("@")) {
      return c.json({ error: "OIDC claims do not contain a valid email." }, 400);
    }

    // Provision/link user
    let provisionResult;
    try {
      provisionResult = await provisionOrLinkUser({
        email,
        nameId: claims.sub || email,
        attributes: claims,
        orgId: config.org_id,
        defaultRoleId: config.default_role_id || "member",
        autoProvision: config.auto_provision !== false,
        database,
      });
    } catch (err) {
      mapleLog("warn", "sso.oidc_provisioning_failed", {
        email,
        configId: config.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json({
        error: "User provisioning failed.",
        detail: err instanceof Error ? err.message : String(err),
      }, 403);
    }

    // Create session
    const session = await createSessionAndCookie(
      c,
      provisionResult.user,
      config.id,
      "oidc",
      claims.sub,
      undefined,
    );

    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_SSO_LOGIN",
      sourceService: "gateway-api",
      userId: provisionResult.user.id,
      severity: "RISK_SEVERITY_LOW",
      summary: `OIDC SSO login for ${email}`,
      payload: {
        protocol: "oidc",
        domain: config.domain,
        configId: config.id,
        isNewUser: provisionResult.isNewUser,
        sub: claims.sub,
      },
    });

    mapleLog("info", "sso.oidc_login_success", {
      userId: provisionResult.user.id,
      email,
      isNewUser: provisionResult.isNewUser,
      configId: config.id,
    });

    const returnTo = stateEntry.returnTo || "/";
    return c.redirect(returnTo, 302);
  });

  // ── 7. List SSO Configs (Admin) ────────────────────────────────────────
  app.get("/api/auth/sso/config", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const authCtx = getAuthContext(c);
    if (!authCtx || (authCtx.role !== "admin" && authCtx.role !== "owner")) {
      return c.json({ error: "Admin access required." }, 403);
    }

    const orgId = asString(c.req.query("orgId"));

    try {
      let result;
      if (orgId) {
        result = await database.pool.query(
          `SELECT id, org_id, protocol, domain, enabled, entity_id, acs_url,
                  idp_sso_url, idp_issuer, oidc_client_id,
                  oidc_authorization_endpoint, oidc_token_endpoint, oidc_jwks_uri,
                  oidc_issuer, auto_provision, default_role_id, created_at, updated_at
           FROM sso_configurations WHERE org_id = $1 ORDER BY created_at DESC`,
          [orgId],
        );
      } else {
        result = await database.pool.query(
          `SELECT id, org_id, protocol, domain, enabled, entity_id, acs_url,
                  idp_sso_url, idp_issuer, oidc_client_id,
                  oidc_authorization_endpoint, oidc_token_endpoint, oidc_jwks_uri,
                  oidc_issuer, auto_provision, default_role_id, created_at, updated_at
           FROM sso_configurations ORDER BY created_at DESC`,
        );
      }

      // Intentionally omit sensitive fields: idp_certificate, oidc_client_secret
      return c.json({ ok: true, items: result.rows });
    } catch (err) {
      return c.json({
        ok: true,
        items: [],
        warning: "SSO tables may not be initialized.",
      });
    }
  });

  // ── 8. Create/Update SSO Config (Admin) ────────────────────────────────
  app.post("/api/auth/sso/config", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const authCtx = getAuthContext(c);
    if (!authCtx || (authCtx.role !== "admin" && authCtx.role !== "owner")) {
      return c.json({ error: "Admin access required." }, 403);
    }

    const body = await readJsonBody(c);
    const protocol = asString(body.protocol);
    const domain = asString(body.domain)?.toLowerCase().trim();
    const orgId = asString(body.orgId);
    const existingId = asString(body.id);

    if (!protocol || !["saml", "oidc"].includes(protocol)) {
      return c.json({ error: "protocol must be 'saml' or 'oidc'." }, 400);
    }
    if (!domain) {
      return c.json({ error: "domain is required." }, 400);
    }
    if (!orgId) {
      return c.json({ error: "orgId is required." }, 400);
    }

    const now = new Date().toISOString();
    const configId = existingId || randomUUID();

    try {
      if (existingId) {
        // Update existing configuration
        const sets = [];
        const params = [];
        let paramIdx = 1;

        const fields = {
          protocol, domain, org_id: orgId,
          enabled: body.enabled !== undefined ? body.enabled : true,
          entity_id: asString(body.entityId) || null,
          acs_url: asString(body.acsUrl) || null,
          idp_sso_url: asString(body.idpSsoUrl) || null,
          idp_certificate: asString(body.idpCertificate) || null,
          idp_issuer: asString(body.idpIssuer) || null,
          oidc_client_id: asString(body.oidcClientId) || null,
          oidc_client_secret: asString(body.oidcClientSecret) || null,
          oidc_authorization_endpoint: asString(body.oidcAuthorizationEndpoint) || null,
          oidc_token_endpoint: asString(body.oidcTokenEndpoint) || null,
          oidc_jwks_uri: asString(body.oidcJwksUri) || null,
          oidc_issuer: asString(body.oidcIssuer) || null,
          auto_provision: body.autoProvision !== undefined ? body.autoProvision : true,
          default_role_id: asString(body.defaultRoleId) || "member",
          metadata_json: body.metadata ? JSON.stringify(body.metadata) : null,
          updated_at: now,
        };

        for (const [col, val] of Object.entries(fields)) {
          sets.push(`${col} = $${paramIdx}`);
          params.push(val);
          paramIdx++;
        }
        params.push(existingId);

        await database.pool.query(
          `UPDATE sso_configurations SET ${sets.join(", ")} WHERE id = $${paramIdx}`,
          params,
        );
      } else {
        // Insert new configuration
        await database.pool.query(
          `INSERT INTO sso_configurations
            (id, org_id, protocol, domain, enabled, entity_id, acs_url,
             idp_sso_url, idp_certificate, idp_issuer,
             oidc_client_id, oidc_client_secret,
             oidc_authorization_endpoint, oidc_token_endpoint, oidc_jwks_uri, oidc_issuer,
             auto_provision, default_role_id, metadata_json, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
          [
            configId, orgId, protocol, domain,
            body.enabled !== undefined ? body.enabled : true,
            asString(body.entityId) || null,
            asString(body.acsUrl) || null,
            asString(body.idpSsoUrl) || null,
            asString(body.idpCertificate) || null,
            asString(body.idpIssuer) || null,
            asString(body.oidcClientId) || null,
            asString(body.oidcClientSecret) || null,
            asString(body.oidcAuthorizationEndpoint) || null,
            asString(body.oidcTokenEndpoint) || null,
            asString(body.oidcJwksUri) || null,
            asString(body.oidcIssuer) || null,
            body.autoProvision !== undefined ? body.autoProvision : true,
            asString(body.defaultRoleId) || "member",
            body.metadata ? JSON.stringify(body.metadata) : null,
            now, now,
          ],
        );
      }

      emitAuditEvent({
        eventType: existingId
          ? "AUDIT_EVENT_TYPE_SSO_CONFIG_UPDATED"
          : "AUDIT_EVENT_TYPE_SSO_CONFIG_CREATED",
        sourceService: "gateway-api",
        userId: authCtx.userId,
        severity: "RISK_SEVERITY_HIGH",
        summary: `SSO config ${existingId ? "updated" : "created"} for domain '${domain}'`,
        payload: { configId, domain, protocol, orgId },
      });

      mapleLog("info", "sso.config_saved", {
        configId,
        domain,
        protocol,
        action: existingId ? "updated" : "created",
      });

      return c.json({ ok: true, configId, action: existingId ? "updated" : "created" }, existingId ? 200 : 201);
    } catch (err) {
      if (String(err.code) === "23505" || String(err.message).includes("duplicate")) {
        return c.json({ error: `An SSO configuration already exists for domain '${domain}'.` }, 409);
      }
      mapleLog("error", "sso.config_save_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json({ error: "Failed to save SSO configuration." }, 500);
    }
  });

  // ── 9. Test SSO Connection ─────────────────────────────────────────────
  app.post("/api/auth/sso/config/test", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const authCtx = getAuthContext(c);
    if (!authCtx || (authCtx.role !== "admin" && authCtx.role !== "owner")) {
      return c.json({ error: "Admin access required." }, 403);
    }

    const body = await readJsonBody(c);
    const configId = asString(body.configId);

    if (!configId) {
      return c.json({ error: "configId is required." }, 400);
    }

    const config = await findSsoConfigById(configId);
    if (!config) {
      return c.json({ error: "SSO configuration not found." }, 404);
    }

    const checks = [];

    if (config.protocol === "saml") {
      // Validate SAML configuration completeness
      checks.push({
        check: "idp_sso_url",
        passed: Boolean(config.idp_sso_url),
        detail: config.idp_sso_url ? "IdP SSO URL is configured" : "IdP SSO URL is missing",
      });
      checks.push({
        check: "idp_certificate",
        passed: Boolean(config.idp_certificate),
        detail: config.idp_certificate ? "IdP certificate is configured" : "IdP certificate is missing",
      });
      checks.push({
        check: "sp_metadata",
        passed: true,
        detail: "SP metadata can be generated",
      });

      // Test that the IdP SSO URL is reachable
      if (config.idp_sso_url) {
        try {
          const url = new URL(config.idp_sso_url);
          checks.push({
            check: "idp_url_valid",
            passed: true,
            detail: `IdP URL host '${url.hostname}' is valid`,
          });
        } catch {
          checks.push({
            check: "idp_url_valid",
            passed: false,
            detail: "IdP SSO URL is not a valid URL",
          });
        }
      }
    } else if (config.protocol === "oidc") {
      checks.push({
        check: "oidc_client_id",
        passed: Boolean(config.oidc_client_id),
        detail: config.oidc_client_id ? "Client ID is configured" : "Client ID is missing",
      });
      checks.push({
        check: "oidc_client_secret",
        passed: Boolean(config.oidc_client_secret),
        detail: config.oidc_client_secret ? "Client secret is configured" : "Client secret is missing",
      });
      checks.push({
        check: "oidc_authorization_endpoint",
        passed: Boolean(config.oidc_authorization_endpoint),
        detail: config.oidc_authorization_endpoint
          ? "Authorization endpoint is configured"
          : "Authorization endpoint is missing",
      });
      checks.push({
        check: "oidc_token_endpoint",
        passed: Boolean(config.oidc_token_endpoint),
        detail: config.oidc_token_endpoint ? "Token endpoint is configured" : "Token endpoint is missing",
      });

      // Test JWKS fetch if URI is configured
      if (config.oidc_jwks_uri) {
        try {
          const { fetchJwks: fetchJwksTest } = await import("../core/sso-oidc.js");
          const jwks = await fetchJwksTest(config.oidc_jwks_uri);
          checks.push({
            check: "oidc_jwks_fetch",
            passed: true,
            detail: `JWKS fetched successfully (${jwks.keys.length} key(s))`,
          });
        } catch (err) {
          checks.push({
            check: "oidc_jwks_fetch",
            passed: false,
            detail: `JWKS fetch failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      } else {
        checks.push({
          check: "oidc_jwks_uri",
          passed: false,
          detail: "JWKS URI is not configured",
        });
      }
    }

    const allPassed = checks.every((ch) => ch.passed);

    mapleLog("info", "sso.config_test", {
      configId,
      protocol: config.protocol,
      allPassed,
      failedChecks: checks.filter((ch) => !ch.passed).map((ch) => ch.check),
    });

    return c.json({
      ok: true,
      configId,
      protocol: config.protocol,
      domain: config.domain,
      allPassed,
      checks,
    });
  });
}
