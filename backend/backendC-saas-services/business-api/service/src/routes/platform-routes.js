import { randomUUID } from "node:crypto";
import { asString, readJsonBody } from "@maple/common";
import { findRequestSession } from "../auth-session.js";

const orgStore = new Map();
const inviteStore = new Map();
const personalApiKeyStore = new Map();
const serviceAccountStore = new Map();
const limitOverrideStore = new Map();

function nowIso() {
  return new Date().toISOString();
}

function parseLimit(rawValue, fallback = 30) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(parsed, 365));
}

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
    membersCount: org.members.length,
  };
}

function listOrgsForUser(userId) {
  return [...orgStore.values()]
    .filter((org) => org.members.some((member) => member.userId === userId))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function requireOrg(orgId) {
  return orgStore.get(String(orgId ?? "").trim());
}

function requireOrgMembership(org, userId) {
  return org.members.some((member) => member.userId === userId);
}

function normalizeApiKeyLabel(value, fallback) {
  const label = asString(value);
  if (!label) {
    return fallback;
  }
  return label.slice(0, 80);
}

function ensureStoreArray(map, key) {
  const normalized = String(key ?? "").trim();
  const existing = map.get(normalized);
  if (Array.isArray(existing)) {
    return existing;
  }
  const created = [];
  map.set(normalized, created);
  return created;
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

export function registerPlatformRoutes(app, options) {
  const database = options.database;

  app.get("/api/business/org", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const orgs = listOrgsForUser(auth.session.user.id).map((org) =>
      organizationToApi(org)
    );
    return c.json({ ok: true, items: orgs });
  });

  app.post("/api/business/org", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const body = await readJsonBody(c);
    const name = asString(body.name) ?? `Org ${auth.session.user.username}`;
    const orgId = randomUUID();
    const timestamp = nowIso();
    const org = {
      orgId,
      name,
      ownerUserId: auth.session.user.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      members: [
        {
          userId: auth.session.user.id,
          roleId: "owner",
          joinedAt: timestamp,
        },
      ],
      roles: defaultRoles(),
    };
    orgStore.set(orgId, org);
    return c.json({ ok: true, org: organizationToApi(org) }, 201);
  });

  app.patch("/api/business/org/:orgId", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const org = requireOrg(c.req.param("orgId"));
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    if (!requireOrgMembership(org, auth.session.user.id)) {
      return c.json({ error: "Forbidden." }, 403);
    }
    const body = await readJsonBody(c);
    const name = asString(body.name);
    if (name) {
      org.name = name;
      org.updatedAt = nowIso();
    }
    return c.json({ ok: true, org: organizationToApi(org) });
  });

  app.get("/api/business/org/:orgId/members", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const org = requireOrg(c.req.param("orgId"));
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    if (!requireOrgMembership(org, auth.session.user.id)) {
      return c.json({ error: "Forbidden." }, 403);
    }
    return c.json({ ok: true, items: org.members });
  });

  app.post("/api/business/org/:orgId/invites", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const org = requireOrg(c.req.param("orgId"));
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    if (!requireOrgMembership(org, auth.session.user.id)) {
      return c.json({ error: "Forbidden." }, 403);
    }
    const body = await readJsonBody(c);
    const roleId = asString(body.roleId) ?? "member";
    const inviteId = randomUUID();
    const invite = {
      inviteId,
      orgId: org.orgId,
      issuedBy: auth.session.user.id,
      roleId,
      email: asString(body.email) ?? "",
      createdAt: nowIso(),
      acceptedAt: "",
      acceptedBy: "",
    };
    inviteStore.set(inviteId, invite);
    return c.json({ ok: true, invite }, 201);
  });

  app.post("/api/business/org/invites/:inviteId/accept", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const invite = inviteStore.get(String(c.req.param("inviteId") ?? "").trim());
    if (!invite) {
      return c.json({ error: "Invite not found." }, 404);
    }
    const org = requireOrg(invite.orgId);
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    if (!org.members.some((member) => member.userId === auth.session.user.id)) {
      org.members.push({
        userId: auth.session.user.id,
        roleId: invite.roleId || "member",
        joinedAt: nowIso(),
      });
      org.updatedAt = nowIso();
    }
    invite.acceptedAt = nowIso();
    invite.acceptedBy = auth.session.user.id;
    return c.json({ ok: true, org: organizationToApi(org), invite });
  });

  app.delete("/api/business/org/:orgId/members/:userId", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const org = requireOrg(c.req.param("orgId"));
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    if (!requireOrgMembership(org, auth.session.user.id)) {
      return c.json({ error: "Forbidden." }, 403);
    }
    const userId = String(c.req.param("userId") ?? "").trim();
    org.members = org.members.filter((member) => member.userId !== userId);
    org.updatedAt = nowIso();
    return c.json({ ok: true, removedUserId: userId });
  });

  app.get("/api/business/org/:orgId/roles", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const org = requireOrg(c.req.param("orgId"));
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    if (!requireOrgMembership(org, auth.session.user.id)) {
      return c.json({ error: "Forbidden." }, 403);
    }
    return c.json({ ok: true, items: org.roles });
  });

  app.post("/api/business/org/:orgId/roles/:roleId/assign", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const org = requireOrg(c.req.param("orgId"));
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    if (!requireOrgMembership(org, auth.session.user.id)) {
      return c.json({ error: "Forbidden." }, 403);
    }
    const body = await readJsonBody(c);
    const userId = asString(body.userId);
    if (!userId) {
      return c.json({ error: "userId is required." }, 400);
    }
    const roleId = String(c.req.param("roleId") ?? "").trim() || "member";
    const existing = org.members.find((member) => member.userId === userId);
    if (existing) {
      existing.roleId = roleId;
    } else {
      org.members.push({
        userId,
        roleId,
        joinedAt: nowIso(),
      });
    }
    org.updatedAt = nowIso();
    return c.json({ ok: true, userId, roleId });
  });

  app.get("/api/business/user/api-keys", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const keys = ensureStoreArray(personalApiKeyStore, auth.session.user.id).map((key) => ({
      keyId: key.keyId,
      name: key.name,
      createdAt: key.createdAt,
      expiresAt: key.expiresAt,
      fingerprint: key.fingerprint,
    }));
    return c.json({ ok: true, items: keys });
  });

  app.post("/api/business/user/api-keys", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const body = await readJsonBody(c);
    const token = buildGeneratedKey("maple_user");
    const record = {
      keyId: randomUUID(),
      name: normalizeApiKeyLabel(body.name, "api-key"),
      createdAt: nowIso(),
      expiresAt: asString(body.expiresAt) ?? "",
      fingerprint: token.slice(-12),
      token,
    };
    ensureStoreArray(personalApiKeyStore, auth.session.user.id).push(record);
    return c.json(
      {
        ok: true,
        key: {
          keyId: record.keyId,
          name: record.name,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          fingerprint: record.fingerprint,
          token: record.token,
        },
      },
      201
    );
  });

  app.delete("/api/business/user/api-keys/:keyId", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const keyId = String(c.req.param("keyId") ?? "").trim();
    const keys = ensureStoreArray(personalApiKeyStore, auth.session.user.id);
    const remaining = keys.filter((entry) => entry.keyId !== keyId);
    personalApiKeyStore.set(auth.session.user.id, remaining);
    return c.json({ ok: true, keyId });
  });

  app.get("/api/business/org/:orgId/service-accounts", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const org = requireOrg(c.req.param("orgId"));
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    if (!requireOrgMembership(org, auth.session.user.id)) {
      return c.json({ error: "Forbidden." }, 403);
    }
    const items = ensureStoreArray(serviceAccountStore, org.orgId).map((account) => ({
      id: account.id,
      name: account.name,
      createdAt: account.createdAt,
      keys: account.keys.map((key) => ({
        keyId: key.keyId,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        fingerprint: key.fingerprint,
      })),
    }));
    return c.json({ ok: true, items });
  });

  app.post("/api/business/org/:orgId/service-accounts", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const org = requireOrg(c.req.param("orgId"));
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    if (!requireOrgMembership(org, auth.session.user.id)) {
      return c.json({ error: "Forbidden." }, 403);
    }
    const body = await readJsonBody(c);
    const account = {
      id: randomUUID(),
      name: normalizeApiKeyLabel(body.name, "service-account"),
      createdAt: nowIso(),
      keys: [],
    };
    ensureStoreArray(serviceAccountStore, org.orgId).push(account);
    return c.json({ ok: true, account }, 201);
  });

  app.post("/api/business/org/:orgId/service-accounts/:id/keys", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const org = requireOrg(c.req.param("orgId"));
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    if (!requireOrgMembership(org, auth.session.user.id)) {
      return c.json({ error: "Forbidden." }, 403);
    }
    const accountId = String(c.req.param("id") ?? "").trim();
    const accounts = ensureStoreArray(serviceAccountStore, org.orgId);
    const account = accounts.find((item) => item.id === accountId);
    if (!account) {
      return c.json({ error: "Service account not found." }, 404);
    }
    const body = await readJsonBody(c);
    const token = buildGeneratedKey("maple_sa");
    const key = {
      keyId: randomUUID(),
      createdAt: nowIso(),
      expiresAt: asString(body.expiresAt) ?? "",
      fingerprint: token.slice(-12),
      token,
    };
    account.keys.push(key);
    return c.json({ ok: true, key }, 201);
  });

  app.delete(
    "/api/business/org/:orgId/service-accounts/:id/keys/:keyId",
    async (c) => {
      const auth = await requireSession(c, database);
      if (auth.error) {
        return auth.error;
      }
      const org = requireOrg(c.req.param("orgId"));
      if (!org) {
        return c.json({ error: "Organization not found." }, 404);
      }
      if (!requireOrgMembership(org, auth.session.user.id)) {
        return c.json({ error: "Forbidden." }, 403);
      }
      const accountId = String(c.req.param("id") ?? "").trim();
      const keyId = String(c.req.param("keyId") ?? "").trim();
      const accounts = ensureStoreArray(serviceAccountStore, org.orgId);
      const account = accounts.find((item) => item.id === accountId);
      if (!account) {
        return c.json({ error: "Service account not found." }, 404);
      }
      account.keys = account.keys.filter((key) => key.keyId !== keyId);
      return c.json({ ok: true, keyId });
    }
  );

  app.get("/api/business/entitlements", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const subscription = await database.ensureFreeSubscription(auth.session.user.id);
    const plan = subscription.plan || "free";
    const entitlements =
      plan === "enterprise"
        ? ["agent:longform", "org:rbac", "audit:export", "tools:governance"]
        : plan === "team"
          ? ["agent:longform", "org:members", "usage:timeseries"]
          : ["agent:turn", "usage:summary"];
    return c.json({ ok: true, plan, entitlements });
  });

  app.get("/api/business/usage/summary", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    return c.json({
      ok: true,
      summary: {
        window: "30d",
        runs: 0,
        toolExecutions: 0,
        modelTokens: 0,
      },
    });
  });

  app.get("/api/business/usage/timeseries", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const days = parseLimit(c.req.query("days"), 14);
    const now = Date.now();
    const points = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      points.push({
        ts: new Date(now - i * 24 * 60 * 60 * 1000).toISOString(),
        runs: 0,
        toolExecutions: 0,
        modelTokens: 0,
      });
    }
    return c.json({ ok: true, points });
  });

  app.get("/api/business/limits", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const overrides = limitOverrideStore.get(auth.session.user.id) ?? {};
    return c.json({
      ok: true,
      limits: {
        maxRunsPerDay: 100,
        maxToolCallsPerDay: 500,
        maxConcurrentLongform: 2,
        ...overrides,
      },
    });
  });

  app.post("/api/business/limits/override", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const body = await readJsonBody(c);
    const patch = {
      maxRunsPerDay: Number.isFinite(Number(body.maxRunsPerDay))
        ? Math.max(1, Math.trunc(Number(body.maxRunsPerDay)))
        : undefined,
      maxToolCallsPerDay: Number.isFinite(Number(body.maxToolCallsPerDay))
        ? Math.max(1, Math.trunc(Number(body.maxToolCallsPerDay)))
        : undefined,
      maxConcurrentLongform: Number.isFinite(Number(body.maxConcurrentLongform))
        ? Math.max(1, Math.trunc(Number(body.maxConcurrentLongform)))
        : undefined,
    };
    const next = {
      ...(limitOverrideStore.get(auth.session.user.id) ?? {}),
      ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
    };
    limitOverrideStore.set(auth.session.user.id, next);
    return c.json({ ok: true, limits: next });
  });
}
