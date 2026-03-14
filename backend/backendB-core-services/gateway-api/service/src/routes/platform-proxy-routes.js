import { asString, readJsonBody } from "../helpers.js";
import { findRequestSession } from "../auth.js";
import { requireApiKeyResponse } from "../auth-api-key.js";
import { database } from "../state.js";
import { PlatformStore } from "../core/platform-store.js";

function parseIntOrUndefined(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.trunc(parsed);
}

function positiveIntOrUndefined(value) {
  const parsed = parseIntOrUndefined(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

async function requireSession(c) {
  const session = await findRequestSession(database, c.req.header("cookie"));
  if (!session) {
    return { error: c.json({ error: "Authentication required." }, 401) };
  }
  return { session };
}

async function requireOrgRole(c, orgId, userId, minRole) {
  const store = getStore();
  const org = await store.getOrganizationForUser(orgId, userId);
  if (!org) return { error: c.json({ error: "Organization not found." }, 404) };
  const memberRole = await store.getMemberRole(orgId, userId);
  if (!memberRole) return { error: c.json({ error: "Not a member." }, 403) };
  const ROLE_RANK = { owner: 3, admin: 2, member: 1 };
  if ((ROLE_RANK[memberRole] ?? 0) < (ROLE_RANK[minRole] ?? 0)) {
    return { error: c.json({ error: `Requires ${minRole} role or higher.` }, 403) };
  }
  return { org, role: memberRole };
}

function normalizeOrgSummary(org) {
  return {
    orgId: org.orgId,
    name: org.name,
    ownerUserId: org.ownerUserId,
    bio: org.bio ?? "",
    email: org.email ?? "",
    email_is_public: org.email_is_public ?? true,
    currency: org.currency ?? "usd",
    address: org.address ?? "",
    city: org.city ?? "",
    region: org.region ?? "",
    postal_code: org.postal_code ?? "",
    country: org.country ?? "",
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
    membersCount: org.membersCount,
  };
}

let _store;
function getStore() {
  if (!_store) {
    _store = new PlatformStore({ database });
  }
  return _store;
}

export function registerPlatformProxyRoutes(app) {
  // ── Organization routes ──────────────────────────────────────────────────
  app.get("/api/org", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const store = getStore();
    const items = await store.listOrganizationsForUser(auth.session.user.id);
    return c.json({ ok: true, items: items.map((org) => normalizeOrgSummary(org)) });
  });

  app.post("/api/org", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const store = getStore();
    const body = await readJsonBody(c);
    const name = asString(body.name) ?? `Org ${auth.session.user.username}`;
    const org = await store.createOrganization({
      name,
      ownerUserId: auth.session.user.id,
    });
    return c.json({ ok: true, org: normalizeOrgSummary(org) }, 201);
  });

  app.patch("/api/org/:orgId", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const store = getStore();
    const orgId = asString(c.req.param("orgId"));
    if (!orgId) {
      return c.json({ error: "orgId is required." }, 400);
    }
    const existing = await store.getOrganizationForUser(orgId, auth.session.user.id);
    if (!existing) {
      return c.json({ error: "Organization not found." }, 404);
    }
    const body = await readJsonBody(c);
    const updated = await store.updateOrganizationProfile(orgId, {
      name: body.name !== undefined ? asString(body.name) : existing.name,
      bio: body.bio,
      email: body.email,
      email_is_public: body.email_is_public,
      currency: body.currency,
      address: body.address,
      city: body.city,
      region: body.region,
      postal_code: body.postal_code,
      country: body.country,
    });
    return c.json({ ok: true, org: normalizeOrgSummary(updated) });
  });

  app.get("/api/org/:orgId/members", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const store = getStore();
    const orgId = asString(c.req.param("orgId"));
    const org = await store.getOrganizationForUser(orgId, auth.session.user.id);
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    const items = await store.listOrganizationMembers(org.orgId);
    return c.json({ ok: true, items });
  });

  app.get("/api/org/:orgId/invites", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const store = getStore();
    const orgId = asString(c.req.param("orgId"));
    const org = await store.getOrganizationForUser(orgId, auth.session.user.id);
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    const items = await store.listOrganizationInvites(org.orgId);
    return c.json({ ok: true, items });
  });

  app.post("/api/org/:orgId/invites", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const orgId = asString(c.req.param("orgId"));
    const roleCheck = await requireOrgRole(c, orgId, auth.session.user.id, "admin");
    if (roleCheck.error) {
      return roleCheck.error;
    }
    const store = getStore();
    const body = await readJsonBody(c);
    const invite = await store.createOrganizationInvite({
      orgId: roleCheck.org.orgId,
      issuedBy: auth.session.user.id,
      roleId: asString(body.roleId) ?? "member",
      email: asString(body.email) ?? "",
    });
    return c.json({ ok: true, invite }, 201);
  });

  app.post("/api/org/invites/:inviteId/accept", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const store = getStore();
    const inviteId = asString(c.req.param("inviteId"));
    if (!inviteId) {
      return c.json({ error: "inviteId is required." }, 400);
    }
    const invite = await store.acceptOrganizationInvite(inviteId, auth.session.user.id, auth.session.user.email);
    if (!invite) {
      return c.json({ error: "Invite not found." }, 404);
    }
    const org = await store.getOrganizationForUser(invite.orgId, auth.session.user.id);
    return c.json({
      ok: true,
      org: org ? normalizeOrgSummary(org) : null,
      invite,
    });
  });

  app.delete("/api/org/:orgId/members/:userId", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const orgId = asString(c.req.param("orgId"));
    const roleCheck = await requireOrgRole(c, orgId, auth.session.user.id, "admin");
    if (roleCheck.error) {
      return roleCheck.error;
    }
    const store = getStore();
    const userId = asString(c.req.param("userId"));
    if (!userId) {
      return c.json({ error: "userId is required." }, 400);
    }
    if (roleCheck.org.ownerUserId === userId) {
      return c.json({ error: "Cannot remove organization owner." }, 409);
    }
    const removed = await store.removeOrganizationMember(roleCheck.org.orgId, userId);
    if (!removed) {
      return c.json({ error: "Member not found." }, 404);
    }
    return c.json({ ok: true, removedUserId: userId });
  });

  app.get("/api/org/:orgId/roles", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const store = getStore();
    const orgId = asString(c.req.param("orgId"));
    const org = await store.getOrganizationForUser(orgId, auth.session.user.id);
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    const items = await store.listOrganizationRoles(org.orgId);
    return c.json({ ok: true, items });
  });

  app.post("/api/org/:orgId/roles/:roleId/assign", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const orgId = asString(c.req.param("orgId"));
    const roleCheck = await requireOrgRole(c, orgId, auth.session.user.id, "owner");
    if (roleCheck.error) {
      return roleCheck.error;
    }
    const store = getStore();
    const roleId = asString(c.req.param("roleId")) ?? "member";
    const body = await readJsonBody(c);
    const userId = asString(body.userId);
    if (!userId) {
      return c.json({ error: "userId is required." }, 400);
    }
    const ROLE_RANK = { owner: 3, admin: 2, member: 1 };
    if ((ROLE_RANK[roleId] ?? 0) > (ROLE_RANK[roleCheck.role] ?? 0)) {
      return c.json({ error: "Cannot assign a role higher than your own." }, 403);
    }
    if (userId === auth.session.user.id) {
      return c.json({ error: "Cannot reassign your own role." }, 403);
    }
    const assigned = await store.assignOrganizationRole(roleCheck.org.orgId, userId, roleId);
    return c.json({ ok: true, ...assigned });
  });

  // ── User API keys ────────────────────────────────────────────────────────
  app.get("/api/user/api-keys", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const store = getStore();
    const items = await store.listUserApiKeys(auth.session.user.id);
    return c.json({ ok: true, items });
  });

  app.post("/api/user/api-keys", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const store = getStore();
    const body = await readJsonBody(c);
    const created = await store.createUserApiKey(auth.session.user.id, {
      name: asString(body.name),
      expiresAt: asString(body.expiresAt),
    });
    return c.json({ ok: true, key: created }, 201);
  });

  app.delete("/api/user/api-keys/:keyId", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const store = getStore();
    const keyId = asString(c.req.param("keyId"));
    const deleted = await store.deleteUserApiKey(auth.session.user.id, keyId);
    if (!deleted) {
      return c.json({ error: "API key not found." }, 404);
    }
    return c.json({ ok: true, keyId });
  });

  // ── Service accounts ─────────────────────────────────────────────────────
  app.get("/api/org/:orgId/service-accounts", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const store = getStore();
    const orgId = asString(c.req.param("orgId"));
    const org = await store.getOrganizationForUser(orgId, auth.session.user.id);
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    const items = await store.listServiceAccounts(org.orgId);
    return c.json({ ok: true, items });
  });

  app.post("/api/org/:orgId/service-accounts", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const orgId = asString(c.req.param("orgId"));
    const roleCheck = await requireOrgRole(c, orgId, auth.session.user.id, "admin");
    if (roleCheck.error) {
      return roleCheck.error;
    }
    const store = getStore();
    const body = await readJsonBody(c);
    const account = await store.createServiceAccount(roleCheck.org.orgId, asString(body.name));
    return c.json({ ok: true, account }, 201);
  });

  app.get("/api/org/:orgId/service-accounts/:id/keys", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const store = getStore();
    const orgId = asString(c.req.param("orgId"));
    const org = await store.getOrganizationForUser(orgId, auth.session.user.id);
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    const accountId = asString(c.req.param("id"));
    const items = await store.listServiceAccountKeys(org.orgId, accountId);
    return c.json({ ok: true, items });
  });

  app.post("/api/org/:orgId/service-accounts/:id/keys", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const orgId = asString(c.req.param("orgId"));
    const roleCheck = await requireOrgRole(c, orgId, auth.session.user.id, "admin");
    if (roleCheck.error) {
      return roleCheck.error;
    }
    const store = getStore();
    const accountId = asString(c.req.param("id"));
    const body = await readJsonBody(c);
    const key = await store.createServiceAccountKey(roleCheck.org.orgId, accountId, {
      expiresAt: asString(body.expiresAt),
    });
    if (!key) {
      return c.json({ error: "Service account not found." }, 404);
    }
    return c.json({ ok: true, key }, 201);
  });

  app.delete("/api/org/:orgId/service-accounts/:id/keys/:keyId", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const orgId = asString(c.req.param("orgId"));
    const roleCheck = await requireOrgRole(c, orgId, auth.session.user.id, "admin");
    if (roleCheck.error) {
      return roleCheck.error;
    }
    const store = getStore();
    const accountId = asString(c.req.param("id"));
    const keyId = asString(c.req.param("keyId"));
    const deleted = await store.deleteServiceAccountKey(roleCheck.org.orgId, accountId, keyId);
    if (!deleted) {
      return c.json({ error: "Service account key not found." }, 404);
    }
    return c.json({ ok: true, keyId });
  });

  // ── Entitlements, usage & limits ─────────────────────────────────────────
  app.get("/api/entitlements", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const store = getStore();
    const result = await store.getEntitlementsForUser(auth.session.user.id);
    return c.json({ ok: true, ...result });
  });

  app.get("/api/usage/summary", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const store = getStore();
    const summary = await store.getUsageSummary(auth.session.user.id);
    return c.json({ ok: true, summary });
  });

  app.get("/api/usage/timeseries", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const store = getStore();
    const days = positiveIntOrUndefined(c.req.query("days")) ?? 14;
    const points = await store.getUsageTimeseries(auth.session.user.id, days);
    return c.json({ ok: true, points });
  });

  app.get("/api/limits", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const store = getStore();
    const limits = await store.getLimitsForUser(auth.session.user.id);
    return c.json({ ok: true, limits });
  });

  app.post("/api/limits/override", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database, { requireApiKey: true });
    if (unauthorized) return unauthorized;
    const store = getStore();
    const body = await readJsonBody(c);
    const userId = asString(body.userId);
    if (!userId) {
      return c.json({ error: "userId is required." }, 400);
    }
    const limits = await store.updateLimitsForUser(userId, {
      maxRunsPerDay: positiveIntOrUndefined(body.maxRunsPerDay),
      maxToolCallsPerDay: positiveIntOrUndefined(body.maxToolCallsPerDay),
      maxConcurrentLongform: positiveIntOrUndefined(body.maxConcurrentLongform),
    });
    return c.json({ ok: true, limits });
  });
}
