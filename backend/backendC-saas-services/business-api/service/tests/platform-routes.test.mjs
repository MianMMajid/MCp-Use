import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";
import { registerPlatformRoutes } from "../src/routes/platform-routes.js";

function createDatabaseStub() {
  return {
    async findActiveSession(sessionId) {
      if (sessionId !== "session-123") {
        return undefined;
      }
      return {
        id: sessionId,
        user: {
          id: "user-1",
          username: "maple",
          email: "maple@example.com",
        },
      };
    },
  };
}

function createPlatformStoreStub() {
  return {
    async listOrganizationsForUser() {
      return [{ orgId: "org-1", name: "Maple Org", membersCount: 1 }];
    },
    async createOrganization(input) {
      return {
        orgId: "org-1",
        name: input.name,
        ownerUserId: input.ownerUserId,
        membersCount: 1,
      };
    },
    async getOrganizationForUser(orgId) {
      if (orgId !== "org-1") {
        return null;
      }
      return {
        orgId: "org-1",
        name: "Maple Org",
        ownerUserId: "user-1",
        membersCount: 1,
      };
    },
    async updateOrganizationName(orgId, name) {
      return {
        orgId,
        name,
        ownerUserId: "user-1",
        membersCount: 1,
      };
    },
    async listOrganizationMembers() {
      return [{ userId: "user-1", roleId: "owner" }];
    },
    async createOrganizationInvite() {
      return { inviteId: "invite-1", orgId: "org-1" };
    },
    async acceptOrganizationInvite() {
      return { inviteId: "invite-1", orgId: "org-1" };
    },
    async removeOrganizationMember() {
      return true;
    },
    async listOrganizationRoles() {
      return [{ roleId: "owner" }, { roleId: "member" }];
    },
    async assignOrganizationRole(_orgId, userId, roleId) {
      return { userId, roleId };
    },
    async listUserApiKeys() {
      return [{ keyId: "key-1" }];
    },
    async createUserApiKey() {
      return { keyId: "key-2" };
    },
    async deleteUserApiKey() {
      return true;
    },
    async listServiceAccounts() {
      return [{ accountId: "svc-1" }];
    },
    async createServiceAccount() {
      return { accountId: "svc-2" };
    },
    async createServiceAccountKey() {
      return { keyId: "svc-key-1" };
    },
    async deleteServiceAccountKey() {
      return true;
    },
    async getEntitlementsForUser() {
      return { plan: "team", features: ["tool-governance"] };
    },
    async getUsageSummary() {
      return { runs: 12 };
    },
    async getUsageTimeseries() {
      return [{ day: "2026-02-25", runs: 2 }];
    },
    async getLimitsForUser() {
      return { maxRunsPerDay: 100 };
    },
    async updateLimitsForUser() {
      return { maxRunsPerDay: 250 };
    },
  };
}

function createApp() {
  const app = new Hono();
  registerPlatformRoutes(app, {
    database: createDatabaseStub(),
    platformStore: createPlatformStoreStub(),
  });
  return app;
}

test("platform routes require session authentication", async () => {
  const app = createApp();
  const response = await app.request("http://localhost/api/business/org");
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.error, "Authentication required.");
});

test("platform routes expose org, key, usage, and limits lifecycle", async () => {
  const app = createApp();
  const authHeaders = { cookie: "maple_session=session-123", "content-type": "application/json" };

  assert.equal(
    (await app.request("http://localhost/api/business/org", { headers: authHeaders })).status,
    200
  );
  assert.equal(
    (
      await app.request("http://localhost/api/business/org", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: "Maple Org" }),
      })
    ).status,
    201
  );
  assert.equal(
    (
      await app.request("http://localhost/api/business/org/org-1", {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ name: "Maple Org v2" }),
      })
    ).status,
    200
  );
  assert.equal(
    (
      await app.request("http://localhost/api/business/user/api-keys", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: "automation" }),
      })
    ).status,
    201
  );
  assert.equal(
    (
      await app.request("http://localhost/api/business/usage/timeseries?days=7", {
        headers: authHeaders,
      })
    ).status,
    200
  );
  const override = await app.request("http://localhost/api/business/limits/override", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ maxRunsPerDay: 250 }),
  });
  assert.equal(override.status, 200);
  const overridePayload = await override.json();
  assert.equal(overridePayload.ok, true);
  assert.equal(overridePayload.limits.maxRunsPerDay, 250);
});
