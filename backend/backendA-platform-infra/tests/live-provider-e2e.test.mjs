import assert from "node:assert/strict";
import test from "node:test";
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
