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
  MAPLE_OPENCLAW_MODIFIER_ENABLED: "0",
  MAPLE_INTEGRATION_OAUTH_REDIRECT_BASE_URL: "http://localhost",
  GITHUB_OAUTH_CLIENT_ID: "test-github-client-id",
  GITHUB_OAUTH_CLIENT_SECRET: "test-github-client-secret",
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
      console.log("[SKIP] PostgreSQL not reachable — skipping CLI browser flow tests");
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
  const req = new Request(`http://localhost${path}`, options);
  return appResult.app.fetch(req);
}

async function createSessionUser(label) {
  const suffix = `${label}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const user = await database.createUser({
    username: `cli-${suffix}`,
    email: `cli-${suffix}@example.com`,
    passwordHash: hashPassword("password123"),
  });
  const session = await database.createSession(user.id, 3600);
  return {
    user,
    session,
    cookie: `maple_session=${session.id}`,
  };
}

test("google CLI auth flow can be started and completed from a browser session", async (t) => {
  if (!pgAvailable) return t.skip("PostgreSQL not reachable");

  const startResponse = await appFetch("/api/auth/google/cli/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(startResponse.status, 200);
  const startPayload = await startResponse.json();
  assert.equal(startPayload.ok, true);
  assert.match(String(startPayload.browserUrl), /\/api\/auth\/google\/cli\//);

  const { cookie, user } = await createSessionUser("google-flow");
  const completeResponse = await appFetch(
    `${startPayload.pollUrl}?view=browser&complete=1`,
    {
      headers: { cookie },
    }
  );
  assert.equal(completeResponse.status, 200);

  const statusResponse = await appFetch(startPayload.pollUrl);
  const statusPayload = await statusResponse.json();
  assert.equal(statusPayload.status, "completed");
  assert.equal(statusPayload.user?.id, user.id);
  assert.equal(statusPayload.sessionCookie?.cookieName, "maple_session");
});

test("integration CLI oauth flow can be started and completed after callback success", async (t) => {
  if (!pgAvailable) return t.skip("PostgreSQL not reachable");

  const { cookie, user } = await createSessionUser("integration-flow");
  const startResponse = await appFetch("/api/integrations/github/oauth/cli/start", {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(startResponse.status, 200);
  const startPayload = await startResponse.json();
  assert.equal(startPayload.ok, true);
  assert.equal(startPayload.provider, "github");

  await database.upsertUserIntegration({
    userId: user.id,
    provider: "github",
    displayName: "GitHub",
    status: "connected",
    authType: "oauth2",
    externalAccountId: "acct_cli_test",
    scopes: ["repo"],
    metadata: {},
    connectedAt: new Date().toISOString(),
    disconnectedAt: null,
  });

  const completeResponse = await appFetch(
    `${startPayload.pollUrl}?view=browser&oauth=success`,
    {
      headers: { cookie },
    }
  );
  assert.equal(completeResponse.status, 200);

  const statusResponse = await appFetch(startPayload.pollUrl, {
    headers: { cookie },
  });
  const statusPayload = await statusResponse.json();
  assert.equal(statusPayload.status, "completed");
  assert.equal(statusPayload.provider, "github");
  assert.equal(statusPayload.integration?.status, "connected");
});
