import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Stripe from "stripe";

const LIVE_PROVIDERS_ENABLED =
  String(process.env.MAPLE_LIVE_PROVIDER_E2E ?? "0").trim() === "1";

if (String(process.env.MAPLE_LIVE_PROVIDER_INSECURE_TLS ?? "0").trim() === "1") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function runLiveTest(name, fn) {
  if (!LIVE_PROVIDERS_ENABLED) {
    test(
      name,
      {
        skip: "Set MAPLE_LIVE_PROVIDER_E2E=1 to run live-provider integration checks.",
      },
      fn
    );
    return;
  }
  test(name, fn);
}

function firstEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] ?? "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function requiredEnv(name, aliases = []) {
  const value = firstEnv([name, ...aliases]);
  const label = [name, ...aliases].join(" or ");
  assert.ok(value, `${label} is required for live-provider e2e test.`);
  return value;
}

function toBaseUrl(rawUrl) {
  const normalized = String(rawUrl ?? "").trim();
  assert.ok(normalized, "Live provider URL cannot be empty.");
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

runLiveTest("Google live provider: verify test ID token against Google certs", async (t) => {
  const googleClientId = requiredEnv("GOOGLE_CLIENT_ID", ["MAPLE_GOOGLE_CLIENT_ID"]);
  const idToken = firstEnv([
    "MAPLE_LIVE_GOOGLE_TEST_ID_TOKEN",
    "GOOGLE_TEST_ID_TOKEN",
    "MAPLE_GOOGLE_TEST_ID_TOKEN",
  ]);
  if (!idToken) {
    const certsResponse = await fetch("https://www.googleapis.com/oauth2/v3/certs");
    assert.equal(certsResponse.status, 200);
    const certsPayload = await certsResponse.json();
    assert.equal(Array.isArray(certsPayload?.keys), true);
    t.diagnostic(
      "MAPLE_LIVE_GOOGLE_TEST_ID_TOKEN missing; ran cert reachability check instead of token verification."
    );
    return;
  }

  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = googleClientId;

  try {
    const authGoogleUrl = pathToFileURL(
      resolve(
        process.cwd(),
        "backend/backendC-saas-services/business-api/service/src/auth-google.js"
      )
    ).href;
    const { verifyGoogleJwt } = await import(
      `${authGoogleUrl}?cacheBust=${Date.now()}-${Math.random()}`
    );
    const verified = await verifyGoogleJwt(idToken);
    assert.ok(
      typeof verified?.email === "string" && verified.email.includes("@"),
      "Google token verified but email claim was missing."
    );
  } finally {
    if (previousClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = previousClientId;
    }
  }
});

runLiveTest("Stripe live provider: account + price ids are valid", async () => {
  const stripeSecretKey = requiredEnv("STRIPE_SECRET_KEY");
  const requiredPriceIds = [
    requiredEnv("STRIPE_PRICE_PRO"),
    requiredEnv("STRIPE_PRICE_TEAM"),
    requiredEnv("STRIPE_PRICE_ENTERPRISE"),
  ];

  const stripe = new Stripe(stripeSecretKey);
  const account = await stripe.accounts.retrieve();
  assert.ok(
    typeof account?.id === "string" && account.id.startsWith("acct_"),
    "Stripe account lookup failed."
  );

  for (const priceId of requiredPriceIds) {
    const price = await stripe.prices.retrieve(priceId);
    assert.equal(price.id, priceId);
    assert.ok(price.unit_amount !== null, `Stripe price ${priceId} has no amount.`);
  }
});

runLiveTest("OpenClaw live provider: bridge health + sessions API reachable", async (t) => {
  const bridgeBaseUrl = toBaseUrl(
    requiredEnv("OPENCLAW_BRIDGE_URL", ["MAPLE_OPENCLAW_BRIDGE_URL"])
  );
  const bridgeToken = firstEnv([
    "OPENCLAW_BRIDGE_TOKEN",
    "MAPLE_OPENCLAW_BRIDGE_TOKEN",
    "MAPLE_API_KEY",
  ]);

  let healthResponse;
  try {
    healthResponse = await fetch(new URL("health", bridgeBaseUrl));
  } catch (error) {
    t.skip(
      `OpenClaw bridge is unreachable (${bridgeBaseUrl}): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return;
  }
  assert.equal(
    healthResponse.status,
    200,
    `OpenClaw health failed with HTTP ${healthResponse.status}`
  );
  const healthPayload = await healthResponse.json();
  assert.equal(healthPayload?.ok, true);

  let sessionsResponse;
  try {
    sessionsResponse = await fetch(new URL("sessions", bridgeBaseUrl), {
      headers: bridgeToken
        ? {
            authorization: `Bearer ${bridgeToken}`,
          }
        : undefined,
    });
  } catch (error) {
    t.skip(
      `OpenClaw sessions endpoint is unreachable (${bridgeBaseUrl}): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return;
  }
  if (bridgeToken) {
    assert.equal(
      sessionsResponse.status,
      200,
      `OpenClaw sessions API failed with HTTP ${sessionsResponse.status}`
    );
  } else {
    assert.equal(
      [200, 401, 403].includes(sessionsResponse.status),
      true,
      `OpenClaw sessions API failed with HTTP ${sessionsResponse.status}`
    );
    t.diagnostic(
      "OPENCLAW_BRIDGE_TOKEN missing; verified health and non-crash sessions behavior."
    );
  }
  const sessionsPayload = await sessionsResponse.json();
  if (sessionsResponse.status === 200) {
    assert.ok(Array.isArray(sessionsPayload?.sessions));
  } else {
    assert.equal(typeof sessionsPayload, "object");
  }
});
