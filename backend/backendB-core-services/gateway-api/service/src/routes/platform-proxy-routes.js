import { asString, readJsonBody } from "../helpers.js";
import { findRequestSession } from "../auth.js";
import { authContextStorage } from "../auth-context.js";
import { requireApiKeyResponse } from "../auth-api-key.js";
import { database } from "../state.js";
import { PlatformStore } from "../core/platform-store.js";
import { GatewayOperationsPlatformService } from "../core/operations-platform-service.js";
import { validateOrgCreate, validateOrgUpdate } from "../contracts/org-contract.js";
import { validateMemberInvite, validateRoleUpdate } from "../contracts/rbac-contract.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { mapleLog } from "../logging.js";
import { allowNoAuth } from "../config.js";

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
    if (allowNoAuth) {
      return { session: { userId: "no-auth-user", method: "no_auth", role: "admin" } };
    }
    return { error: c.json({ error: "Authentication required." }, 401) };
  }
  return { session };
}

const ROLE_RANK = { owner: 4, admin: 3, member: 2, billing: 1, viewer: 0 };

async function requireOrgRole(c, orgId, userId, minRole) {
  const store = getStore();
  const org = await store.getOrganizationForUser(orgId, userId);
  if (!org) return { error: c.json({ error: "Organization not found." }, 404) };
  const memberRole = await store.getMemberRole(orgId, userId);
  if (!memberRole) return { error: c.json({ error: "Not a member." }, 403) };
  if ((ROLE_RANK[memberRole] ?? 0) < (ROLE_RANK[minRole] ?? 0)) {
    return { error: c.json({ error: `Requires ${minRole} role or higher.` }, 403) };
  }
  return { org, role: memberRole };
}

/**
 * M2-02: Cross-tenant validation -- verifies that the authenticated tenant context
 * matches the organization's tenant ID. Returns 403 if they differ.
 */
function requireTenantMatch(c, org) {
  const headerTenantId = c.req.header("x-tenant-id") || c.req.header("x-maple-tenant-id") || "";
  if (!headerTenantId) return null;
  const orgTenantId = org.tenantId ?? "";
  if (!orgTenantId) return null;
  if (headerTenantId !== orgTenantId) {
    return c.json({ error: "Tenant mismatch: you are not authorized for this organization's tenant." }, 403);
  }
  return null;
}

/**
 * M2-03: Invite expiry -- default 7 days from now.
 */
function defaultInviteExpiresAt(expiresAt) {
  if (expiresAt) return expiresAt;
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString();
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
    status: org.status ?? "active",
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
    membersCount: org.membersCount,
  };
}

/**
 * M2-06: Business-API proxy helper. Forwards to business-api with context headers.
 * Returns null when business-api is not configured (graceful degradation).
 */
const BUSINESS_API_BASE_URL = (process.env.MAPLE_BUSINESS_API_URL ?? "").trim();
const BUSINESS_API_REQUIRED = (process.env.MAPLE_BUSINESS_API_REQUIRED ?? "").trim().toLowerCase() === "true";

async function proxyToBusinessApi(c, method, path, { body, session } = {}) {
  if (!BUSINESS_API_BASE_URL) {
    return null;
  }
  const url = `${BUSINESS_API_BASE_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    "X-Maple-Tenant-Id": c.req.header("x-tenant-id") || c.req.header("x-maple-tenant-id") || "",
    "X-Maple-Org-Id": c.req.header("x-org-id") || c.req.header("x-maple-org-id") || "",
    "X-Maple-User-Id": session?.user?.id ?? "",
  };
  try {
    const fetchOptions = { method, headers };
    if (body && method !== "GET" && method !== "HEAD") {
      fetchOptions.body = JSON.stringify(body);
    }
    const resp = await fetch(url, fetchOptions);
    const data = await resp.json().catch(() => ({}));
    return c.json(data, resp.status);
  } catch (err) {
    mapleLog("warn", "gateway_api.business_api_proxy_error", {
      method,
      path,
      error: err instanceof Error ? err.message : String(err),
    });
    if (BUSINESS_API_REQUIRED) {
      return c.json({ error: "Business API is unavailable." }, 503);
    }
    return null;
  }
}

let _store;
let _operationsService;
function getStore() {
  if (!_store) {
    _store = new PlatformStore({ database });
  }
  return _store;
}

function getOperationsService() {
  if (!_operationsService) {
    _operationsService = new GatewayOperationsPlatformService({ database, platformStore: getStore() });
  }
  return _operationsService;
}

export function registerPlatformProxyRoutes(app) {
  // -- Organization routes --------------------------------------------------------
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
    const body = await readJsonBody(c);
    // M2-01: Validate with org-contract
    const validation = validateOrgCreate(body);
    if (!validation.valid) {
      return c.json({ error: validation.errors.join("; ") }, 400);
    }
    const result = await getOperationsService().createOrganization(
      {
        userId: auth.session.user.id,
        role: auth.session.user.role ?? "user",
      },
      {
        name: validation.sanitized.name || `Org ${auth.session.user.username}`,
        slug: validation.sanitized.slug,
        tenantId: body.tenantId,
        parentOrgId: body.parentOrgId,
        orgType: body.orgType,
        bio: body.bio,
        email: body.email,
        email_is_public: body.email_is_public,
        currency: body.currency,
        address: body.address,
        city: body.city,
        region: body.region,
        postal_code: body.postal_code,
        country: body.country,
      }
    );
    return c.json({ ok: true, org: normalizeOrgSummary(result.org), binding: result.binding }, 201);
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
    // M2-02: Cross-tenant validation
    const tenantError = requireTenantMatch(c, existing);
    if (tenantError) return tenantError;
    const body = await readJsonBody(c);
    // M2-01: Validate with org-contract
    const validation = validateOrgUpdate(body);
    if (!validation.valid) {
      return c.json({ error: validation.errors.join("; ") }, 400);
    }
    const updated = await getOperationsService().updateOrganization(
      {
        userId: auth.session.user.id,
        role: auth.session.user.role ?? "user",
      },
      orgId,
      {
        name: validation.sanitized.name !== undefined ? validation.sanitized.name : existing.name,
        bio: body.bio,
        email: body.email,
        email_is_public: body.email_is_public,
        currency: body.currency,
        address: body.address,
        city: body.city,
        region: body.region,
        postal_code: body.postal_code,
        country: body.country,
        parentOrgId: body.parentOrgId,
        orgType: body.orgType,
      }
    );
    if (!updated) {
      return c.json({ error: "Organization not found." }, 404);
    }
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
    // M2-02: Cross-tenant validation
    const tenantError = requireTenantMatch(c, org);
    if (tenantError) return tenantError;
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
    // M2-02: Cross-tenant validation
    const tenantError = requireTenantMatch(c, org);
    if (tenantError) return tenantError;
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
    // M2-02: Cross-tenant validation
    const tenantError = requireTenantMatch(c, roleCheck.org);
    if (tenantError) return tenantError;
    const store = getStore();
    const body = await readJsonBody(c);
    // M2-01: Validate invite with rbac-contract
    const inviteValidation = validateMemberInvite(body);
    if (!inviteValidation.valid) {
      return c.json({ error: inviteValidation.errors.join("; ") }, 400);
    }
    // M2-05: Role escalation prevention -- cannot invite with a role higher than your own
    if ((ROLE_RANK[inviteValidation.sanitized.role] ?? 0) > (ROLE_RANK[roleCheck.role] ?? 0)) {
      return c.json({ error: "Cannot invite with a role higher than your own." }, 403);
    }
    const invite = await store.createOrganizationInvite({
      orgId: roleCheck.org.orgId,
      issuedBy: auth.session.user.id,
      roleId: inviteValidation.sanitized.role,
      email: inviteValidation.sanitized.email,
      // M2-03: Invite expiry -- default 7 days
      expiresAt: defaultInviteExpiresAt(asString(body.expiresAt)),
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
    // M2-03: Check invite expiry before accepting
    if (typeof store.getOrganizationInvite === "function") {
      const pendingInvite = await store.getOrganizationInvite(inviteId);
      if (pendingInvite?.expiresAt) {
        const expiryDate = new Date(pendingInvite.expiresAt);
        if (expiryDate < new Date()) {
          return c.json({ error: "Invite has expired." }, 410);
        }
      }
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
    // M2-02: Cross-tenant validation
    const tenantError = requireTenantMatch(c, roleCheck.org);
    if (tenantError) return tenantError;
    const store = getStore();
    const userId = asString(c.req.param("userId"));
    if (!userId) {
      return c.json({ error: "userId is required." }, 400);
    }
    // M2-04: Owner cannot remove self
    if (roleCheck.org.ownerUserId === userId && userId === auth.session.user.id) {
      return c.json({ error: "Owner cannot remove themselves." }, 400);
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
    const roleCheck = await requireOrgRole(c, orgId, auth.session.user.id, "admin");
    if (roleCheck.error) {
      return roleCheck.error;
    }
    // M2-02: Cross-tenant validation
    const tenantError = requireTenantMatch(c, roleCheck.org);
    if (tenantError) return tenantError;
    const store = getStore();
    const roleId = asString(c.req.param("roleId")) ?? "member";
    const body = await readJsonBody(c);
    const userId = asString(body.userId);
    if (!userId) {
      return c.json({ error: "userId is required." }, 400);
    }
    // M2-01: Validate with rbac-contract
    const roleValidation = validateRoleUpdate({ role: roleId });
    if (!roleValidation.valid) {
      return c.json({ error: roleValidation.errors.join("; ") }, 400);
    }
    // M2-05: Role escalation prevention -- cannot assign a role higher than your own
    if ((ROLE_RANK[roleId] ?? 0) > (ROLE_RANK[roleCheck.role] ?? 0)) {
      return c.json({ error: "Cannot assign a role higher than your own." }, 403);
    }
    // M2-05: Non-owner members cannot assign admin or owner roles
    if (roleCheck.role !== "owner" && (roleId === "admin" || roleId === "owner")) {
      return c.json({ error: "Only owners can assign admin or owner roles." }, 403);
    }
    if (userId === auth.session.user.id) {
      return c.json({ error: "Cannot reassign your own role." }, 403);
    }
    // Verify target user exists before creating membership
    const targetUser = await database.findUserById(userId);
    if (!targetUser) {
      return c.json({ error: "User not found." }, 404);
    }
    const assigned = await store.assignOrganizationRole(roleCheck.org.orgId, userId, roleId);
    return c.json({ ok: true, ...assigned });
  });

  // -- User API keys --------------------------------------------------------------
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

  // -- Service accounts -----------------------------------------------------------
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

  // -- Entitlements, usage & limits -----------------------------------------------
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
    const unauthorized = await requireApiKeyResponse(c, database, { requireApiKey: false, allowSession: true });
    if (unauthorized) return unauthorized;
    const ctx = authContextStorage.getStore();
    if (ctx?.method !== "session") {
      return c.json({ ok: false, error: "Limits override requires admin session auth." }, 403);
    }
    if (ctx?.role !== "admin") {
      return c.json({ ok: false, error: "Limits override requires admin role." }, 403);
    }
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

  // -- M2-06: Gateway proxy layer for /api/orgs/* ---------------------------------
  // These routes forward to business-api with context header propagation
  // (X-Maple-Tenant-Id, X-Maple-Org-Id, X-Maple-User-Id).
  // If business-api is unavailable and MAPLE_BUSINESS_API_REQUIRED=true, returns 503.
  // Otherwise, the request falls through to the local org routes via redirect.

  app.all("/api/orgs/*", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const method = c.req.method.toUpperCase();
    const path = c.req.path;
    let body = undefined;
    if (method !== "GET" && method !== "HEAD" && method !== "DELETE") {
      try {
        body = await readJsonBody(c);
      } catch {
        // no body is fine for some requests
      }
    }
    const proxyResult = await proxyToBusinessApi(c, method, path, {
      body,
      session: auth.session,
    });
    if (proxyResult) {
      return proxyResult;
    }
    // Business-api not configured or unavailable (non-required mode).
    // Rewrite /api/orgs/:orgId/... to /api/org/:orgId/... and let the
    // local handlers above serve the request.
    const rewrittenPath = path.replace(/^\/api\/orgs\//, "/api/org/");
    if (rewrittenPath !== path) {
      const url = new URL(c.req.url);
      url.pathname = rewrittenPath;
      return c.redirect(url.toString(), 307);
    }
    return c.json({ error: "Not found." }, 404);
  });
}
