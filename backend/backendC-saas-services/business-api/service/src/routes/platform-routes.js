import { randomUUID, createHash } from "node:crypto";
import { asString, readJsonBody } from "@maple/common";
import { findRequestSession } from "../auth-session.js";

// ── Persistent storage (DB-backed with in-memory fallback) ──────────────────
// State is stored in the database when available, falling back to module-level
// Maps only when the database pool is not present (test/dev without PG).
const memoryStore = {
  orgs: new Map(),
  invites: new Map(),
  personalApiKeys: new Map(),
  serviceAccounts: new Map(),
  limitOverrides: new Map(),
};

let dbPool = null;
let tablesInitialized = false;

async function ensureTables(pool) {
  if (tablesInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_orgs (
      org_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      members_json TEXT NOT NULL DEFAULT '[]',
      roles_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS business_invites (
      invite_id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      issued_by TEXT NOT NULL,
      role_id TEXT NOT NULL DEFAULT 'member',
      email TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      accepted_at TEXT NOT NULL DEFAULT '',
      accepted_by TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS business_user_api_keys (
      key_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL DEFAULT '',
      fingerprint TEXT NOT NULL,
      key_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS business_service_accounts (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS business_service_account_keys (
      key_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL DEFAULT '',
      fingerprint TEXT NOT NULL,
      key_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS business_limit_overrides (
      user_id TEXT PRIMARY KEY,
      overrides_json TEXT NOT NULL DEFAULT '{}'
    );
  `);
  tablesInitialized = true;
}

function hasPool() {
  return Boolean(dbPool && typeof dbPool.query === "function");
}

function nowIso() {
  return new Date().toISOString();
}

function keyHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function parseLimit(rawValue, fallback = 30) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 365));
}

const ROLE_RANK = { owner: 3, admin: 2, member: 1 };

function defaultRoles() {
  return [
    { roleId: "owner", label: "Owner", permissions: ["*"] },
    { roleId: "admin", label: "Admin", permissions: ["members:write", "keys:write"] },
    { roleId: "member", label: "Member", permissions: ["tools:read"] },
  ];
}

function organizationToApi(org) {
  return {
    orgId: org.orgId,
    name: org.name,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
    ownerUserId: org.ownerUserId,
    membersCount: Array.isArray(org.members) ? org.members.length : 0,
  };
}

function normalizeApiKeyLabel(value, fallback) {
  const label = asString(value);
  return label ? label.slice(0, 80) : fallback;
}

function buildGeneratedKey(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

async function requireSession(c, database) {
  const session = await findRequestSession(database, c.req.header("cookie"));
  if (!session) {
    return { error: c.json({ error: "Authentication required." }, 401) };
  }
  return { session };
}

// ── RBAC helpers ────────────────────────────────────────────────────────────

function getMemberRole(org, userId) {
  const member = org.members.find((m) => m.userId === userId);
  return member ? member.roleId : null;
}

function requireOrgRole(org, userId, minRole) {
  const role = getMemberRole(org, userId);
  if (!role) return { error: "Not a member of this organization.", status: 403 };
  const userRank = ROLE_RANK[role] ?? 0;
  const requiredRank = ROLE_RANK[minRole] ?? 0;
  if (userRank < requiredRank) {
    return { error: `Requires ${minRole} role or higher.`, status: 403 };
  }
  return { role, rank: userRank };
}

// ── Org storage abstraction ─────────────────────────────────────────────────

async function getOrg(orgId) {
  const id = String(orgId ?? "").trim();
  if (!id) return null;
  if (!hasPool()) return memoryStore.orgs.get(id) ?? null;
  const result = await dbPool.query("SELECT * FROM business_orgs WHERE org_id = $1 LIMIT 1", [id]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    orgId: row.org_id, name: row.name, ownerUserId: row.owner_user_id,
    members: JSON.parse(row.members_json || "[]"),
    roles: JSON.parse(row.roles_json || "[]"),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function saveOrg(org) {
  if (!hasPool()) { memoryStore.orgs.set(org.orgId, org); return; }
  await dbPool.query(`
    INSERT INTO business_orgs (org_id, name, owner_user_id, members_json, roles_json, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (org_id) DO UPDATE SET name=EXCLUDED.name, members_json=EXCLUDED.members_json,
      roles_json=EXCLUDED.roles_json, updated_at=EXCLUDED.updated_at
  `, [org.orgId, org.name, org.ownerUserId, JSON.stringify(org.members), JSON.stringify(org.roles), org.createdAt, org.updatedAt]);
}

async function listOrgsForUser(userId) {
  if (!hasPool()) {
    return [...memoryStore.orgs.values()]
      .filter((o) => o.members.some((m) => m.userId === userId))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  const result = await dbPool.query("SELECT * FROM business_orgs ORDER BY updated_at DESC");
  return result.rows
    .map((row) => ({
      orgId: row.org_id, name: row.name, ownerUserId: row.owner_user_id,
      members: JSON.parse(row.members_json || "[]"),
      roles: JSON.parse(row.roles_json || "[]"),
      createdAt: row.created_at, updatedAt: row.updated_at,
    }))
    .filter((o) => o.members.some((m) => m.userId === userId));
}

async function getInvite(inviteId) {
  const id = String(inviteId ?? "").trim();
  if (!id) return null;
  if (!hasPool()) return memoryStore.invites.get(id) ?? null;
  const result = await dbPool.query("SELECT * FROM business_invites WHERE invite_id = $1 LIMIT 1", [id]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    inviteId: row.invite_id, orgId: row.org_id, issuedBy: row.issued_by,
    roleId: row.role_id, email: row.email, createdAt: row.created_at,
    acceptedAt: row.accepted_at, acceptedBy: row.accepted_by,
  };
}

async function saveInvite(invite) {
  if (!hasPool()) { memoryStore.invites.set(invite.inviteId, invite); return; }
  await dbPool.query(`
    INSERT INTO business_invites (invite_id, org_id, issued_by, role_id, email, created_at, accepted_at, accepted_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (invite_id) DO UPDATE SET accepted_at=EXCLUDED.accepted_at, accepted_by=EXCLUDED.accepted_by
  `, [invite.inviteId, invite.orgId, invite.issuedBy, invite.roleId, invite.email, invite.createdAt, invite.acceptedAt, invite.acceptedBy]);
}

// ── Route registration ──────────────────────────────────────────────────────

export function registerPlatformRoutes(app, options) {
  const database = options.database;
  if (database?.pool && typeof database.pool.query === "function") {
    dbPool = database.pool;
    ensureTables(dbPool).catch(() => {});
  }

  // ── List orgs ──
  app.get("/api/business/org", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const orgs = (await listOrgsForUser(auth.session.user.id)).map(organizationToApi);
    return c.json({ ok: true, items: orgs });
  });

  // ── Create org ──
  app.post("/api/business/org", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const body = await readJsonBody(c);
    const name = asString(body.name) ?? `Org ${auth.session.user.username}`;
    const orgId = randomUUID();
    const timestamp = nowIso();
    const org = {
      orgId, name, ownerUserId: auth.session.user.id,
      createdAt: timestamp, updatedAt: timestamp,
      members: [{ userId: auth.session.user.id, roleId: "owner", joinedAt: timestamp }],
      roles: defaultRoles(),
    };
    await saveOrg(org);
    return c.json({ ok: true, org: organizationToApi(org) }, 201);
  });

  // ── Patch org (admin+) ──
  app.patch("/api/business/org/:orgId", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const org = await getOrg(c.req.param("orgId"));
    if (!org) return c.json({ error: "Organization not found." }, 404);
    const roleCheck = requireOrgRole(org, auth.session.user.id, "admin");
    if (roleCheck.error) return c.json({ error: roleCheck.error }, roleCheck.status);
    const body = await readJsonBody(c);
    const name = asString(body.name);
    if (name) { org.name = name; org.updatedAt = nowIso(); }
    await saveOrg(org);
    return c.json({ ok: true, org: organizationToApi(org) });
  });

  // ── List members ──
  app.get("/api/business/org/:orgId/members", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const org = await getOrg(c.req.param("orgId"));
    if (!org) return c.json({ error: "Organization not found." }, 404);
    const roleCheck = requireOrgRole(org, auth.session.user.id, "member");
    if (roleCheck.error) return c.json({ error: roleCheck.error }, roleCheck.status);
    return c.json({ ok: true, items: org.members });
  });

  // ── Create invite (admin+) ──
  app.post("/api/business/org/:orgId/invites", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const org = await getOrg(c.req.param("orgId"));
    if (!org) return c.json({ error: "Organization not found." }, 404);
    const roleCheck = requireOrgRole(org, auth.session.user.id, "admin");
    if (roleCheck.error) return c.json({ error: roleCheck.error }, roleCheck.status);
    const body = await readJsonBody(c);
    const requestedRole = asString(body.roleId) ?? "member";
    // Cannot issue invites for roles higher than your own
    if ((ROLE_RANK[requestedRole] ?? 0) > roleCheck.rank) {
      return c.json({ error: "Cannot issue invites for a role higher than your own." }, 403);
    }
    const inviteId = randomUUID();
    const invite = {
      inviteId, orgId: org.orgId, issuedBy: auth.session.user.id,
      roleId: requestedRole, email: asString(body.email) ?? "",
      createdAt: nowIso(), acceptedAt: "", acceptedBy: "",
    };
    await saveInvite(invite);
    return c.json({ ok: true, invite }, 201);
  });

  // ── Accept invite (with email targeting + single-use) ──
  app.post("/api/business/org/invites/:inviteId/accept", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const invite = await getInvite(c.req.param("inviteId"));
    if (!invite) return c.json({ error: "Invite not found." }, 404);
    // Single-use: reject already-accepted invites
    if (invite.acceptedAt) {
      return c.json({ error: "Invite has already been accepted." }, 409);
    }
    // Email targeting: if invite specifies an email, acceptor must match
    if (invite.email) {
      const acceptorEmail = auth.session.user.email ?? "";
      if (!acceptorEmail || invite.email.toLowerCase() !== acceptorEmail.trim().toLowerCase()) {
        return c.json({ error: "Invite is targeted to a different email address." }, 403);
      }
    }
    const org = await getOrg(invite.orgId);
    if (!org) return c.json({ error: "Organization not found." }, 404);
    if (!org.members.some((m) => m.userId === auth.session.user.id)) {
      org.members.push({ userId: auth.session.user.id, roleId: invite.roleId || "member", joinedAt: nowIso() });
      org.updatedAt = nowIso();
      await saveOrg(org);
    }
    invite.acceptedAt = nowIso();
    invite.acceptedBy = auth.session.user.id;
    await saveInvite(invite);
    return c.json({ ok: true, org: organizationToApi(org), invite });
  });

  // ── Remove member (admin+, cannot remove owner) ──
  app.delete("/api/business/org/:orgId/members/:userId", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const org = await getOrg(c.req.param("orgId"));
    if (!org) return c.json({ error: "Organization not found." }, 404);
    const roleCheck = requireOrgRole(org, auth.session.user.id, "admin");
    if (roleCheck.error) return c.json({ error: roleCheck.error }, roleCheck.status);
    const userId = String(c.req.param("userId") ?? "").trim();
    if (userId === org.ownerUserId) {
      return c.json({ error: "Cannot remove the organization owner." }, 403);
    }
    org.members = org.members.filter((m) => m.userId !== userId);
    org.updatedAt = nowIso();
    await saveOrg(org);
    return c.json({ ok: true, removedUserId: userId });
  });

  // ── List roles ──
  app.get("/api/business/org/:orgId/roles", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const org = await getOrg(c.req.param("orgId"));
    if (!org) return c.json({ error: "Organization not found." }, 404);
    const roleCheck = requireOrgRole(org, auth.session.user.id, "member");
    if (roleCheck.error) return c.json({ error: roleCheck.error }, roleCheck.status);
    return c.json({ ok: true, items: org.roles });
  });

  // ── Assign role (owner only, no self-reassign, no escalation) ──
  app.post("/api/business/org/:orgId/roles/:roleId/assign", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const org = await getOrg(c.req.param("orgId"));
    if (!org) return c.json({ error: "Organization not found." }, 404);
    const roleCheck = requireOrgRole(org, auth.session.user.id, "owner");
    if (roleCheck.error) return c.json({ error: roleCheck.error }, roleCheck.status);
    const body = await readJsonBody(c);
    const userId = asString(body.userId);
    if (!userId) return c.json({ error: "userId is required." }, 400);
    if (userId === auth.session.user.id) {
      return c.json({ error: "Cannot reassign your own role." }, 403);
    }
    const roleId = String(c.req.param("roleId") ?? "").trim() || "member";
    if ((ROLE_RANK[roleId] ?? 0) > roleCheck.rank) {
      return c.json({ error: "Cannot assign a role higher than your own." }, 403);
    }
    const existing = org.members.find((m) => m.userId === userId);
    if (existing) { existing.roleId = roleId; }
    else { org.members.push({ userId, roleId, joinedAt: nowIso() }); }
    org.updatedAt = nowIso();
    await saveOrg(org);
    return c.json({ ok: true, userId, roleId });
  });

  // ── User API keys (stored with hash, token returned only at creation) ──
  app.get("/api/business/user/api-keys", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const userId = auth.session.user.id;
    let keys;
    if (!hasPool()) {
      keys = (memoryStore.personalApiKeys.get(userId) ?? []).map((k) => ({
        keyId: k.keyId, name: k.name, createdAt: k.createdAt, expiresAt: k.expiresAt, fingerprint: k.fingerprint,
      }));
    } else {
      const result = await dbPool.query("SELECT key_id, name, created_at, expires_at, fingerprint FROM business_user_api_keys WHERE user_id=$1", [userId]);
      keys = result.rows.map((r) => ({ keyId: r.key_id, name: r.name, createdAt: r.created_at, expiresAt: r.expires_at, fingerprint: r.fingerprint }));
    }
    return c.json({ ok: true, items: keys });
  });

  app.post("/api/business/user/api-keys", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const body = await readJsonBody(c);
    const token = buildGeneratedKey("maple_user");
    const record = {
      keyId: randomUUID(), name: normalizeApiKeyLabel(body.name, "api-key"),
      createdAt: nowIso(), expiresAt: asString(body.expiresAt) ?? "",
      fingerprint: token.slice(-12), keyHash: keyHash(token),
    };
    if (!hasPool()) {
      const list = memoryStore.personalApiKeys.get(auth.session.user.id) ?? [];
      list.push({ ...record, token });
      memoryStore.personalApiKeys.set(auth.session.user.id, list);
    } else {
      await dbPool.query(
        "INSERT INTO business_user_api_keys (key_id, user_id, name, created_at, expires_at, fingerprint, key_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [record.keyId, auth.session.user.id, record.name, record.createdAt, record.expiresAt, record.fingerprint, record.keyHash]
      );
    }
    return c.json({ ok: true, key: { keyId: record.keyId, name: record.name, createdAt: record.createdAt, expiresAt: record.expiresAt, fingerprint: record.fingerprint, token } }, 201);
  });

  app.delete("/api/business/user/api-keys/:keyId", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const keyId = String(c.req.param("keyId") ?? "").trim();
    if (!hasPool()) {
      const list = memoryStore.personalApiKeys.get(auth.session.user.id) ?? [];
      memoryStore.personalApiKeys.set(auth.session.user.id, list.filter((k) => k.keyId !== keyId));
    } else {
      await dbPool.query("DELETE FROM business_user_api_keys WHERE key_id=$1 AND user_id=$2", [keyId, auth.session.user.id]);
    }
    return c.json({ ok: true, keyId });
  });

  // ── Service accounts (admin+) ──
  app.get("/api/business/org/:orgId/service-accounts", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const org = await getOrg(c.req.param("orgId"));
    if (!org) return c.json({ error: "Organization not found." }, 404);
    const roleCheck = requireOrgRole(org, auth.session.user.id, "member");
    if (roleCheck.error) return c.json({ error: roleCheck.error }, roleCheck.status);
    let items;
    if (!hasPool()) {
      items = (memoryStore.serviceAccounts.get(org.orgId) ?? []).map((a) => ({
        id: a.id, name: a.name, createdAt: a.createdAt, keys: a.keys.map((k) => ({ keyId: k.keyId, createdAt: k.createdAt, expiresAt: k.expiresAt, fingerprint: k.fingerprint })),
      }));
    } else {
      const accts = await dbPool.query("SELECT * FROM business_service_accounts WHERE org_id=$1", [org.orgId]);
      items = [];
      for (const row of accts.rows) {
        const keysResult = await dbPool.query("SELECT key_id, created_at, expires_at, fingerprint FROM business_service_account_keys WHERE account_id=$1", [row.id]);
        items.push({ id: row.id, name: row.name, createdAt: row.created_at, keys: keysResult.rows.map((k) => ({ keyId: k.key_id, createdAt: k.created_at, expiresAt: k.expires_at, fingerprint: k.fingerprint })) });
      }
    }
    return c.json({ ok: true, items });
  });

  app.post("/api/business/org/:orgId/service-accounts", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const org = await getOrg(c.req.param("orgId"));
    if (!org) return c.json({ error: "Organization not found." }, 404);
    const roleCheck = requireOrgRole(org, auth.session.user.id, "admin");
    if (roleCheck.error) return c.json({ error: roleCheck.error }, roleCheck.status);
    const body = await readJsonBody(c);
    const account = { id: randomUUID(), orgId: org.orgId, name: normalizeApiKeyLabel(body.name, "service-account"), createdAt: nowIso(), keys: [] };
    if (!hasPool()) {
      const list = memoryStore.serviceAccounts.get(org.orgId) ?? [];
      list.push(account);
      memoryStore.serviceAccounts.set(org.orgId, list);
    } else {
      await dbPool.query("INSERT INTO business_service_accounts (id, org_id, name, created_at) VALUES ($1,$2,$3,$4)", [account.id, account.orgId, account.name, account.createdAt]);
    }
    return c.json({ ok: true, account: { id: account.id, name: account.name, createdAt: account.createdAt, keys: [] } }, 201);
  });

  app.post("/api/business/org/:orgId/service-accounts/:id/keys", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const org = await getOrg(c.req.param("orgId"));
    if (!org) return c.json({ error: "Organization not found." }, 404);
    const roleCheck = requireOrgRole(org, auth.session.user.id, "admin");
    if (roleCheck.error) return c.json({ error: roleCheck.error }, roleCheck.status);
    const accountId = String(c.req.param("id") ?? "").trim();
    const body = await readJsonBody(c);
    const token = buildGeneratedKey("maple_sa");
    const key = { keyId: randomUUID(), createdAt: nowIso(), expiresAt: asString(body.expiresAt) ?? "", fingerprint: token.slice(-12), keyHash: keyHash(token) };
    if (!hasPool()) {
      const list = memoryStore.serviceAccounts.get(org.orgId) ?? [];
      const account = list.find((a) => a.id === accountId);
      if (!account) return c.json({ error: "Service account not found." }, 404);
      account.keys.push({ ...key, token });
    } else {
      const exists = await dbPool.query("SELECT id FROM business_service_accounts WHERE id=$1 AND org_id=$2", [accountId, org.orgId]);
      if (exists.rows.length === 0) return c.json({ error: "Service account not found." }, 404);
      await dbPool.query(
        "INSERT INTO business_service_account_keys (key_id, account_id, org_id, created_at, expires_at, fingerprint, key_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [key.keyId, accountId, org.orgId, key.createdAt, key.expiresAt, key.fingerprint, key.keyHash]
      );
    }
    return c.json({ ok: true, key: { keyId: key.keyId, createdAt: key.createdAt, expiresAt: key.expiresAt, fingerprint: key.fingerprint, token } }, 201);
  });

  app.delete("/api/business/org/:orgId/service-accounts/:id/keys/:keyId", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const org = await getOrg(c.req.param("orgId"));
    if (!org) return c.json({ error: "Organization not found." }, 404);
    const roleCheck = requireOrgRole(org, auth.session.user.id, "admin");
    if (roleCheck.error) return c.json({ error: roleCheck.error }, roleCheck.status);
    const accountId = String(c.req.param("id") ?? "").trim();
    const keyId = String(c.req.param("keyId") ?? "").trim();
    if (!hasPool()) {
      const list = memoryStore.serviceAccounts.get(org.orgId) ?? [];
      const account = list.find((a) => a.id === accountId);
      if (account) account.keys = account.keys.filter((k) => k.keyId !== keyId);
    } else {
      await dbPool.query("DELETE FROM business_service_account_keys WHERE key_id=$1 AND account_id=$2 AND org_id=$3", [keyId, accountId, org.orgId]);
    }
    return c.json({ ok: true, keyId });
  });

  // ── Entitlements / Usage / Limits (unchanged) ──
  app.get("/api/business/entitlements", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const subscription = await database.ensureFreeSubscription(auth.session.user.id);
    const plan = subscription.plan || "free";
    const entitlements = plan === "enterprise"
      ? ["agent:longform", "org:rbac", "audit:export", "tools:governance"]
      : plan === "team" ? ["agent:longform", "org:members", "usage:timeseries"] : ["agent:turn", "usage:summary"];
    return c.json({ ok: true, plan, entitlements });
  });

  app.get("/api/business/usage/summary", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    return c.json({ ok: true, summary: { window: "30d", runs: 0, toolExecutions: 0, modelTokens: 0 } });
  });

  app.get("/api/business/usage/timeseries", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const days = parseLimit(c.req.query("days"), 14);
    const now = Date.now();
    const points = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      points.push({ ts: new Date(now - i * 86400000).toISOString(), runs: 0, toolExecutions: 0, modelTokens: 0 });
    }
    return c.json({ ok: true, points });
  });

  app.get("/api/business/limits", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    let overrides = {};
    if (!hasPool()) { overrides = memoryStore.limitOverrides.get(auth.session.user.id) ?? {}; }
    else {
      const result = await dbPool.query("SELECT overrides_json FROM business_limit_overrides WHERE user_id=$1 LIMIT 1", [auth.session.user.id]);
      if (result.rows[0]) overrides = JSON.parse(result.rows[0].overrides_json || "{}");
    }
    return c.json({ ok: true, limits: { maxRunsPerDay: 100, maxToolCallsPerDay: 500, maxConcurrentLongform: 2, ...overrides } });
  });

  app.post("/api/business/limits/override", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) return auth.error;
    const body = await readJsonBody(c);
    const patch = {
      maxRunsPerDay: Number.isFinite(Number(body.maxRunsPerDay)) ? Math.max(1, Math.trunc(Number(body.maxRunsPerDay))) : undefined,
      maxToolCallsPerDay: Number.isFinite(Number(body.maxToolCallsPerDay)) ? Math.max(1, Math.trunc(Number(body.maxToolCallsPerDay))) : undefined,
      maxConcurrentLongform: Number.isFinite(Number(body.maxConcurrentLongform)) ? Math.max(1, Math.trunc(Number(body.maxConcurrentLongform))) : undefined,
    };
    let existing = {};
    if (!hasPool()) { existing = memoryStore.limitOverrides.get(auth.session.user.id) ?? {}; }
    else {
      const result = await dbPool.query("SELECT overrides_json FROM business_limit_overrides WHERE user_id=$1 LIMIT 1", [auth.session.user.id]);
      if (result.rows[0]) existing = JSON.parse(result.rows[0].overrides_json || "{}");
    }
    const next = { ...existing, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
    if (!hasPool()) { memoryStore.limitOverrides.set(auth.session.user.id, next); }
    else {
      await dbPool.query(
        "INSERT INTO business_limit_overrides (user_id, overrides_json) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET overrides_json=EXCLUDED.overrides_json",
        [auth.session.user.id, JSON.stringify(next)]
      );
    }
    return c.json({ ok: true, limits: next });
  });
}
