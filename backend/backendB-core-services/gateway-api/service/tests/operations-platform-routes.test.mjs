import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { applyGatewayTestEnvDefaults } from "./helpers/gateway-test-env.mjs";

applyGatewayTestEnvDefaults({
  MAPLE_SKIP_AUTH_BOOTSTRAP: "1",
  MAPLE_DISABLE_HITL_BROKER: "1",
  MAPLE_ALLOW_NO_AUTH: "1",
  MAPLE_LEADER_ELECTION_ENABLED: "0",
  MAPLE_OPENCLAW_AGENT_ENABLED: "0",
  MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY: "0",
  MAPLE_SESSION_POLL: "0",
  MAPLE_TENANT_CLAIM_SIGNING_KEY: "operations-platform-test-key",
});

const { createApp } = await import("../src/app.js");
const { database } = await import("../src/state.js");
const { hashPassword } = await import("@maple/security");

let appResult = null;
let pgAvailable = false;

test.before(async () => {
  try {
    appResult = await createApp();
    pgAvailable = true;
  } catch (error) {
    if (error?.code === "ECONNREFUSED" || error?.message?.includes("ECONNREFUSED")) {
      console.log("[SKIP] PostgreSQL not reachable - skipping operations platform tests");
    } else {
      throw error;
    }
  }
});

test.after(async () => {
  if (appResult?.shutdown) {
    await appResult.shutdown();
  }
});

async function appFetch(path, options = {}) {
  const request = new Request(`http://localhost${path}`, options);
  return appResult.app.fetch(request);
}

async function requestJson(path, { method = "GET", cookie, headers = {}, body } = {}) {
  const requestHeaders = { ...headers };
  if (cookie) {
    requestHeaders.cookie = cookie;
  }
  if (body !== undefined) {
    requestHeaders["content-type"] = "application/json";
  }
  const response = await appFetch(path, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function createSessionUser(label, role = "user") {
  const suffix = `${label}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const user = await database.createUser({
    username: `ops-${suffix}`,
    email: `ops-${suffix}@example.com`,
    passwordHash: hashPassword("password123"),
    role,
  });
  const session = await database.createSession(user.id, 3600);
  return {
    user,
    cookie: `maple_session=${session.id}`,
  };
}

async function inviteAndAcceptMember({ ownerCookie, memberCookie, orgId, memberEmail }) {
  const inviteResult = await requestJson(`/api/org/${orgId}/invites`, {
    method: "POST",
    cookie: ownerCookie,
    body: { email: memberEmail, roleId: "member" },
  });
  assert.equal(inviteResult.response.status, 201, JSON.stringify(inviteResult.payload));

  const acceptResult = await requestJson(`/api/org/invites/${inviteResult.payload.invite.inviteId}/accept`, {
    method: "POST",
    cookie: memberCookie,
    body: {},
  });
  assert.equal(acceptResult.response.status, 200, JSON.stringify(acceptResult.payload));
}

test("operations orchestration routes create, resolve, and deactivate org lifecycle state", async (t) => {
  if (!pgAvailable) return t.skip("PostgreSQL not reachable");

  const owner = await createSessionUser("ops-owner");
  const tenantId = `tenant-ops-${randomUUID().slice(0, 8)}`;
  const createResult = await requestJson("/api/operations/orchestrations/org", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      name: "Operations Platform Org",
      tenantId,
      orgType: "division",
      bio: "Operational profile",
      city: "New York",
      country: "US",
    },
  });

  assert.equal(createResult.response.status, 201, JSON.stringify(createResult.payload));
  assert.equal(createResult.payload.ok, true);
  assert.equal(createResult.payload.binding.tenantId, tenantId);
  assert.equal(createResult.payload.binding.roleId, "owner");
  const orgId = createResult.payload.org.orgId;

  const bindingsResult = await requestJson("/api/operations/orchestrations/tenant-bindings", {
    cookie: owner.cookie,
  });
  assert.equal(bindingsResult.response.status, 200);
  assert.equal(bindingsResult.payload.bindings.some((binding) => binding.orgId === orgId && binding.tenantId === tenantId), true);

  const scopeHeaders = {
    "x-tenant-id": tenantId,
    "x-org-id": orgId,
  };
  const scopeResult = await requestJson("/api/operations/orchestrations/tenant-scope", {
    cookie: owner.cookie,
    headers: scopeHeaders,
  });
  assert.equal(scopeResult.response.status, 200);
  assert.equal(scopeResult.payload.scope.verified, true);
  assert.equal(scopeResult.payload.scope.method, "db_binding");
  assert.ok(scopeResult.payload.claimSignature);

  const signedScopeResult = await requestJson("/api/operations/orchestrations/tenant-scope", {
    cookie: owner.cookie,
    headers: {
      ...scopeHeaders,
      "x-tenant-claim-signature": scopeResult.payload.claimSignature,
    },
  });
  assert.equal(signedScopeResult.response.status, 200);
  assert.equal(signedScopeResult.payload.scope.method, "signed_claim");

  const treeResult = await requestJson("/api/operations/orchestrations/org/tree", {
    cookie: owner.cookie,
    headers: scopeHeaders,
  });
  assert.equal(treeResult.response.status, 200);
  assert.equal(treeResult.payload.tree.some((node) => node.orgId === orgId), true);

  const detailResult = await requestJson(`/api/operations/orchestrations/org/${orgId}`, {
    cookie: owner.cookie,
    headers: scopeHeaders,
  });
  assert.equal(detailResult.response.status, 200);
  assert.equal(detailResult.payload.org.callerRole, "owner");
  assert.equal(detailResult.payload.org.orgType, "division");
  assert.equal(detailResult.payload.org.status, "active");

  const updateResult = await requestJson(`/api/org/${orgId}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: {
      name: "Operations Platform Org Updated",
      city: "Brooklyn",
      country: "USA",
    },
  });
  assert.equal(updateResult.response.status, 200, JSON.stringify(updateResult.payload));
  assert.equal(updateResult.payload.org.name, "Operations Platform Org Updated");
  assert.equal(updateResult.payload.org.status, "active");

  const lifecycleBeforeDelete = await requestJson(`/api/operations/orchestrations/org/${orgId}/lifecycle`, {
    cookie: owner.cookie,
    headers: scopeHeaders,
  });
  assert.equal(lifecycleBeforeDelete.response.status, 200);
  assert.equal(lifecycleBeforeDelete.payload.events.length > 0, true);
  assert.equal(lifecycleBeforeDelete.payload.events.some((event) => event.eventType === "upsert"), true);

  const deleteResult = await requestJson(`/api/operations/orchestrations/org/${orgId}`, {
    method: "DELETE",
    cookie: owner.cookie,
    headers: {
      ...scopeHeaders,
      "x-tenant-claim-signature": scopeResult.payload.claimSignature,
    },
    body: {},
  });
  assert.equal(deleteResult.response.status, 200, JSON.stringify(deleteResult.payload));
  assert.equal(deleteResult.payload.deactivated, true);

  const lifecycleAfterDelete = await requestJson(`/api/operations/orchestrations/org/${orgId}/lifecycle`, {
    cookie: owner.cookie,
    headers: scopeHeaders,
  });
  assert.equal(lifecycleAfterDelete.response.status, 200);
  assert.equal(lifecycleAfterDelete.payload.events.some((event) => event.eventType === "deactivate"), true);

  const postDeleteBindings = await requestJson("/api/operations/orchestrations/tenant-bindings", {
    cookie: owner.cookie,
  });
  assert.equal(postDeleteBindings.response.status, 200);
  assert.equal(postDeleteBindings.payload.bindings.some((binding) => binding.orgId === orgId), false);

  const orgStatus = await database.pool.query(
    `SELECT status FROM business_orgs WHERE org_id = $1`,
    [orgId]
  );
  assert.equal(orgStatus.rows[0]?.status, "inactive");

  const hierarchyStatus = await database.pool.query(
    `SELECT status FROM org_hierarchy WHERE tenant_id = $1 AND org_id = $2`,
    [tenantId, orgId]
  );
  assert.equal(hierarchyStatus.rows[0]?.status, "inactive");

  const bindingStatus = await database.pool.query(
    `SELECT COUNT(*)::int AS count
     FROM user_tenant_bindings
     WHERE tenant_id = $1 AND org_id = $2 AND status = 'inactive'`,
    [tenantId, orgId]
  );
  assert.equal(bindingStatus.rows[0]?.count >= 1, true);
});

test("canonical org routes and operations aliases stay aligned on shared backing state", async (t) => {
  if (!pgAvailable) return t.skip("PostgreSQL not reachable");

  const owner = await createSessionUser("canonical-owner");
  const createResult = await requestJson("/api/org", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      name: "Canonical Org",
      bio: "Created through canonical route",
      city: "Boston",
    },
  });

  assert.equal(createResult.response.status, 201, JSON.stringify(createResult.payload));
  assert.equal(createResult.payload.org.name, "Canonical Org");
  assert.equal(createResult.payload.org.status, "active");
  assert.equal(createResult.payload.binding.roleId, "owner");

  const bindingsResult = await requestJson("/api/operations/orchestrations/tenant-bindings", {
    cookie: owner.cookie,
  });
  const binding = bindingsResult.payload.bindings.find((item) => item.orgId === createResult.payload.org.orgId);
  assert.ok(binding);

  const detailResult = await requestJson(`/api/operations/orchestrations/org/${createResult.payload.org.orgId}`, {
    cookie: owner.cookie,
    headers: {
      "x-tenant-id": binding.tenantId,
      "x-org-id": binding.orgId,
    },
  });
  assert.equal(detailResult.response.status, 200);
  assert.equal(detailResult.payload.org.name, createResult.payload.org.name);
  assert.equal(detailResult.payload.org.status, createResult.payload.org.status);

  const hierarchyNode = await database.pool.query(
    `SELECT tenant_id, org_type, status
     FROM org_hierarchy
     WHERE tenant_id = $1 AND org_id = $2`,
    [binding.tenantId, binding.orgId]
  );
  assert.equal(hierarchyNode.rows[0]?.tenant_id, binding.tenantId);
  assert.equal(hierarchyNode.rows[0]?.org_type, "team");
  assert.equal(hierarchyNode.rows[0]?.status, "active");
});

test("tenant binding writes enforce admin-vs-self rules and only bind active members", async (t) => {
  if (!pgAvailable) return t.skip("PostgreSQL not reachable");

  const owner = await createSessionUser("bind-owner");
  const member = await createSessionUser("bind-member");
  const stranger = await createSessionUser("bind-stranger");
  const admin = await createSessionUser("bind-admin", "admin");
  const adminTarget = await createSessionUser("bind-admin-target");

  const orgResult = await requestJson("/api/operations/orchestrations/org", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      name: "Binding Rules Org",
    },
  });
  assert.equal(orgResult.response.status, 201, JSON.stringify(orgResult.payload));
  const orgId = orgResult.payload.org.orgId;
  const tenantId = orgResult.payload.org.tenantId;

  await inviteAndAcceptMember({
    ownerCookie: owner.cookie,
    memberCookie: member.cookie,
    orgId,
    memberEmail: member.user.email,
  });
  await inviteAndAcceptMember({
    ownerCookie: owner.cookie,
    memberCookie: adminTarget.cookie,
    orgId,
    memberEmail: adminTarget.user.email,
  });

  const ownerBindingOther = await requestJson("/api/operations/orchestrations/tenant-bindings", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      userId: member.user.id,
      tenantId,
      orgId,
    },
  });
  assert.equal(ownerBindingOther.response.status, 403);

  const strangerSelfBind = await requestJson("/api/operations/orchestrations/tenant-bindings", {
    method: "POST",
    cookie: stranger.cookie,
    body: {
      tenantId,
      orgId,
    },
  });
  assert.equal(strangerSelfBind.response.status, 403);

  const memberSelfBind = await requestJson("/api/operations/orchestrations/tenant-bindings", {
    method: "POST",
    cookie: member.cookie,
    body: {
      tenantId,
      orgId,
    },
  });
  assert.equal(memberSelfBind.response.status, 201, JSON.stringify(memberSelfBind.payload));
  assert.equal(memberSelfBind.payload.binding.userId, member.user.id);
  assert.ok(memberSelfBind.payload.claimSignature);

  const memberScope = await requestJson("/api/operations/orchestrations/tenant-scope", {
    cookie: member.cookie,
    headers: {
      "x-tenant-id": tenantId,
      "x-org-id": orgId,
      "x-tenant-claim-signature": memberSelfBind.payload.claimSignature,
    },
  });
  assert.equal(memberScope.response.status, 200);
  assert.equal(memberScope.payload.scope.verified, true);
  assert.equal(memberScope.payload.scope.method, "signed_claim");

  const adminBindOther = await requestJson("/api/operations/orchestrations/tenant-bindings", {
    method: "POST",
    cookie: admin.cookie,
    body: {
      userId: adminTarget.user.id,
      tenantId,
      orgId,
      roleId: "admin",
    },
  });
  assert.equal(adminBindOther.response.status, 201, JSON.stringify(adminBindOther.payload));
  assert.equal(adminBindOther.payload.binding.roleId, "admin");

  const memberUnbindSelf = await requestJson("/api/operations/orchestrations/tenant-bindings", {
    method: "DELETE",
    cookie: member.cookie,
    body: {
      tenantId,
      orgId,
    },
  });
  assert.equal(memberUnbindSelf.response.status, 200);
  assert.equal(memberUnbindSelf.payload.unbound, true);

  const bindingsAfterDelete = await requestJson("/api/operations/orchestrations/tenant-bindings", {
    cookie: member.cookie,
  });
  assert.equal(bindingsAfterDelete.response.status, 200);
  assert.equal(bindingsAfterDelete.payload.bindings.some((binding) => binding.orgId === orgId), false);
});
