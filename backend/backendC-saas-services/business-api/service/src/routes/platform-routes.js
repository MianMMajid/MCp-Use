import { asString, readJsonBody } from "@maple/common";
import { findRequestSession } from "../auth-session.js";
import { PlatformStore } from "../platform-store.js";

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

async function requireSession(c, database) {
  const session = await findRequestSession(database, c.req.header("cookie"));
  if (!session) {
    return { error: c.json({ error: "Authentication required." }, 401) };
  }
  return { session };
}

function normalizeOrgSummary(org) {
  return {
    orgId: org.orgId,
    name: org.name,
    ownerUserId: org.ownerUserId,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
    membersCount: org.membersCount,
  };
}

export function registerPlatformRoutes(app, options) {
  const database = options.database;
  const store = options.platformStore ?? new PlatformStore({ database });

  app.get("/api/business/org", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const items = await store.listOrganizationsForUser(auth.session.user.id);
    return c.json({ ok: true, items: items.map((org) => normalizeOrgSummary(org)) });
  });

  app.post("/api/business/org", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const body = await readJsonBody(c);
    const name = asString(body.name) ?? `Org ${auth.session.user.username}`;
    const org = await store.createOrganization({
      name,
      ownerUserId: auth.session.user.id,
    });
    return c.json({ ok: true, org: normalizeOrgSummary(org) }, 201);
  });

  app.patch("/api/business/org/:orgId", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const orgId = asString(c.req.param("orgId"));
    if (!orgId) {
      return c.json({ error: "orgId is required." }, 400);
    }
    const existing = await store.getOrganizationForUser(orgId, auth.session.user.id);
    if (!existing) {
      return c.json({ error: "Organization not found." }, 404);
    }
    const body = await readJsonBody(c);
    const name = asString(body.name);
    if (!name) {
      return c.json({ error: "name is required." }, 400);
    }
    const updated = await store.updateOrganizationName(orgId, name);
    return c.json({ ok: true, org: normalizeOrgSummary(updated) });
  });

  app.get("/api/business/org/:orgId/members", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const orgId = asString(c.req.param("orgId"));
    const org = await store.getOrganizationForUser(orgId, auth.session.user.id);
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    const items = await store.listOrganizationMembers(org.orgId);
    return c.json({ ok: true, items });
  });

  app.post("/api/business/org/:orgId/invites", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const orgId = asString(c.req.param("orgId"));
    const org = await store.getOrganizationForUser(orgId, auth.session.user.id);
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    const body = await readJsonBody(c);
    const invite = await store.createOrganizationInvite({
      orgId: org.orgId,
      issuedBy: auth.session.user.id,
      roleId: asString(body.roleId) ?? "member",
      email: asString(body.email) ?? "",
    });
    return c.json({ ok: true, invite }, 201);
  });

  app.post("/api/business/org/invites/:inviteId/accept", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const inviteId = asString(c.req.param("inviteId"));
    if (!inviteId) {
      return c.json({ error: "inviteId is required." }, 400);
    }
    const invite = await store.acceptOrganizationInvite(inviteId, auth.session.user.id);
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

  app.delete("/api/business/org/:orgId/members/:userId", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const orgId = asString(c.req.param("orgId"));
    const userId = asString(c.req.param("userId"));
    const org = await store.getOrganizationForUser(orgId, auth.session.user.id);
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    if (!userId) {
      return c.json({ error: "userId is required." }, 400);
    }
    if (org.ownerUserId === userId) {
      return c.json({ error: "Cannot remove organization owner." }, 409);
    }
    const removed = await store.removeOrganizationMember(org.orgId, userId);
    if (!removed) {
      return c.json({ error: "Member not found." }, 404);
    }
    return c.json({ ok: true, removedUserId: userId });
  });

  app.get("/api/business/org/:orgId/roles", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const orgId = asString(c.req.param("orgId"));
    const org = await store.getOrganizationForUser(orgId, auth.session.user.id);
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    const items = await store.listOrganizationRoles(org.orgId);
    return c.json({ ok: true, items });
  });

  app.post("/api/business/org/:orgId/roles/:roleId/assign", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const orgId = asString(c.req.param("orgId"));
    const roleId = asString(c.req.param("roleId")) ?? "member";
    const org = await store.getOrganizationForUser(orgId, auth.session.user.id);
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    const body = await readJsonBody(c);
    const userId = asString(body.userId);
    if (!userId) {
      return c.json({ error: "userId is required." }, 400);
    }
    const assigned = await store.assignOrganizationRole(org.orgId, userId, roleId);
    return c.json({ ok: true, ...assigned });
  });

  app.get("/api/business/user/api-keys", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const items = await store.listUserApiKeys(auth.session.user.id);
    return c.json({ ok: true, items });
  });

  app.post("/api/business/user/api-keys", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const body = await readJsonBody(c);
    const created = await store.createUserApiKey(auth.session.user.id, {
      name: asString(body.name),
      expiresAt: asString(body.expiresAt),
    });
    return c.json({ ok: true, key: created }, 201);
  });

  app.delete("/api/business/user/api-keys/:keyId", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const keyId = asString(c.req.param("keyId"));
    const deleted = await store.deleteUserApiKey(auth.session.user.id, keyId);
    if (!deleted) {
      return c.json({ error: "API key not found." }, 404);
    }
    return c.json({ ok: true, keyId });
  });

  app.get("/api/business/org/:orgId/service-accounts", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const orgId = asString(c.req.param("orgId"));
    const org = await store.getOrganizationForUser(orgId, auth.session.user.id);
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    const items = await store.listServiceAccounts(org.orgId);
    return c.json({ ok: true, items });
  });

  app.post("/api/business/org/:orgId/service-accounts", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const orgId = asString(c.req.param("orgId"));
    const org = await store.getOrganizationForUser(orgId, auth.session.user.id);
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    const body = await readJsonBody(c);
    const account = await store.createServiceAccount(org.orgId, asString(body.name));
    return c.json({ ok: true, account }, 201);
  });

  app.post("/api/business/org/:orgId/service-accounts/:id/keys", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const orgId = asString(c.req.param("orgId"));
    const accountId = asString(c.req.param("id"));
    const org = await store.getOrganizationForUser(orgId, auth.session.user.id);
    if (!org) {
      return c.json({ error: "Organization not found." }, 404);
    }
    const body = await readJsonBody(c);
    const key = await store.createServiceAccountKey(org.orgId, accountId, {
      expiresAt: asString(body.expiresAt),
    });
    if (!key) {
      return c.json({ error: "Service account not found." }, 404);
    }
    return c.json({ ok: true, key }, 201);
  });

  app.delete(
    "/api/business/org/:orgId/service-accounts/:id/keys/:keyId",
    async (c) => {
      const auth = await requireSession(c, database);
      if (auth.error) {
        return auth.error;
      }
      const orgId = asString(c.req.param("orgId"));
      const accountId = asString(c.req.param("id"));
      const keyId = asString(c.req.param("keyId"));
      const org = await store.getOrganizationForUser(orgId, auth.session.user.id);
      if (!org) {
        return c.json({ error: "Organization not found." }, 404);
      }
      const deleted = await store.deleteServiceAccountKey(org.orgId, accountId, keyId);
      if (!deleted) {
        return c.json({ error: "Service account key not found." }, 404);
      }
      return c.json({ ok: true, keyId });
    }
  );

  app.get("/api/business/entitlements", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const result = await store.getEntitlementsForUser(auth.session.user.id);
    return c.json({ ok: true, ...result });
  });

  app.get("/api/business/usage/summary", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const summary = await store.getUsageSummary(auth.session.user.id);
    return c.json({ ok: true, summary });
  });

  app.get("/api/business/usage/timeseries", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const days = positiveIntOrUndefined(c.req.query("days")) ?? 14;
    const points = await store.getUsageTimeseries(auth.session.user.id, days);
    return c.json({ ok: true, points });
  });

  app.get("/api/business/limits", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const limits = await store.getLimitsForUser(auth.session.user.id);
    return c.json({ ok: true, limits });
  });

  app.post("/api/business/limits/override", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    const body = await readJsonBody(c);
    const limits = await store.updateLimitsForUser(auth.session.user.id, {
      maxRunsPerDay: positiveIntOrUndefined(body.maxRunsPerDay),
      maxToolCallsPerDay: positiveIntOrUndefined(body.maxToolCallsPerDay),
      maxConcurrentLongform: positiveIntOrUndefined(body.maxConcurrentLongform),
    });
    return c.json({ ok: true, limits });
  });
}
