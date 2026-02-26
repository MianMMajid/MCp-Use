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

function requiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  assert.ok(value, `${name} is required for live-provider e2e test.`);
  return value;
}

function toBaseUrl(rawUrl) {
  const normalized = String(rawUrl ?? "").trim();
  assert.ok(normalized, "Live provider URL cannot be empty.");
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

runLiveTest("Google live provider: verify test ID token against Google certs", async () => {
  const googleClientId = requiredEnv("GOOGLE_CLIENT_ID");
  const idToken = requiredEnv("MAPLE_LIVE_GOOGLE_TEST_ID_TOKEN");

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

runLiveTest("OpenClaw live provider: bridge health + sessions API reachable", async () => {
  const bridgeBaseUrl = toBaseUrl(requiredEnv("OPENCLAW_BRIDGE_URL"));
  const bridgeToken = requiredEnv("OPENCLAW_BRIDGE_TOKEN");

  const healthResponse = await fetch(new URL("health", bridgeBaseUrl));
  assert.equal(
    healthResponse.status,
    200,
    `OpenClaw health failed with HTTP ${healthResponse.status}`
  );
  const healthPayload = await healthResponse.json();
  assert.equal(healthPayload?.ok, true);

  const sessionsResponse = await fetch(new URL("sessions", bridgeBaseUrl), {
    headers: {
      authorization: `Bearer ${bridgeToken}`,
    },
  });
  assert.equal(
    sessionsResponse.status,
    200,
    `OpenClaw sessions API failed with HTTP ${sessionsResponse.status}`
  );
  const sessionsPayload = await sessionsResponse.json();
  assert.ok(Array.isArray(sessionsPayload?.sessions));
});
