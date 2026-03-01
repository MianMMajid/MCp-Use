import { readJsonBody } from "../helpers.js";
import {
  businessApiUnavailableResponse,
  proxyBusinessApiRequest,
} from "../core/business-api-client.js";
import {
  getCachedSubscription,
  setCachedSubscription,
  enqueueBillingMutation,
} from "../core/billing-cache.js";

function buildPathWithQuery(basePath, c) {
  const url = new URL(c.req.url);
  const query = url.searchParams.toString();
  if (!query) {
    return basePath;
  }
  return `${basePath}?${query}`;
}

function getUserId(c) {
  return c.get("userId") ?? c.get("sessionUserId") ?? "anonymous";
}

export function registerBillingSubscriptionRoutes(app) {
  // GET /api/billing/subscription — cache-on-read with 503 fallback
  app.get("/api/billing/subscription", async (c) => {
    const proxied = await proxyBusinessApiRequest(c, "/api/business/billing/subscription");
    if (proxied.proxied) {
      const userId = getUserId(c);
      setCachedSubscription(userId, proxied.payload);
      return c.json(proxied.payload, proxied.status);
    }
    // Fallback to cache on 503/unavailable
    const userId = getUserId(c);
    const cached = getCachedSubscription(userId);
    if (cached) {
      return c.json({ ...cached, _cached: true }, 200);
    }
    return businessApiUnavailableResponse(c, proxied, "billing.subscription");
  });

  // POST /api/billing/create-checkout-session — real-time URL required, no queue
  app.post("/api/billing/create-checkout-session", async (c) => {
    const body = await readJsonBody(c);
    const proxied = await proxyBusinessApiRequest(
      c,
      "/api/business/billing/create-checkout-session",
      {
        method: "POST",
        body,
      }
    );
    if (proxied.proxied) {
      return c.json(proxied.payload, proxied.status);
    }
    return c.json(
      { error: "Billing service is temporarily unavailable. Please try again in a few minutes." },
      503
    );
  });

  // POST /api/billing/portal-session — real-time URL required, no queue
  app.post("/api/billing/portal-session", async (c) => {
    const proxied = await proxyBusinessApiRequest(c, "/api/business/billing/portal-session", {
      method: "POST",
    });
    if (proxied.proxied) {
      return c.json(proxied.payload, proxied.status);
    }
    return c.json(
      { error: "Billing service is temporarily unavailable. Please try again in a few minutes." },
      503
    );
  });

  // GET /api/billing/invoices — cache-on-read with 503 fallback
  app.get("/api/billing/invoices", async (c) => {
    const proxied = await proxyBusinessApiRequest(
      c,
      buildPathWithQuery("/api/business/billing/invoices", c)
    );
    if (proxied.proxied) {
      const userId = getUserId(c);
      setCachedSubscription(`${userId}:invoices`, proxied.payload);
      return c.json(proxied.payload, proxied.status);
    }
    const userId = getUserId(c);
    const cached = getCachedSubscription(`${userId}:invoices`);
    if (cached) {
      return c.json({ ...cached, _cached: true }, 200);
    }
    return businessApiUnavailableResponse(c, proxied, "billing.invoices");
  });

  // POST /api/billing/subscription/cancel — queue on 503
  app.post("/api/billing/subscription/cancel", async (c) => {
    const body = await readJsonBody(c);
    const proxied = await proxyBusinessApiRequest(
      c,
      "/api/business/billing/subscription/cancel",
      {
        method: "POST",
        body,
      }
    );
    if (proxied.proxied) {
      return c.json(proxied.payload, proxied.status);
    }
    // Queue for retry
    const userId = getUserId(c);
    await enqueueBillingMutation(userId, { type: "cancel", payload: body }).catch(() => {});
    return c.json(
      { ok: true, queued: true, message: "Queued for retry" },
      202
    );
  });

  // POST /api/billing/subscription/resume — queue on 503
  app.post("/api/billing/subscription/resume", async (c) => {
    const body = await readJsonBody(c);
    const proxied = await proxyBusinessApiRequest(
      c,
      "/api/business/billing/subscription/resume",
      {
        method: "POST",
        body,
      }
    );
    if (proxied.proxied) {
      return c.json(proxied.payload, proxied.status);
    }
    // Queue for retry
    const userId = getUserId(c);
    await enqueueBillingMutation(userId, { type: "resume", payload: body }).catch(() => {});
    return c.json(
      { ok: true, queued: true, message: "Queued for retry" },
      202
    );
  });
}
//# sourceMappingURL=billing-subscription-routes.js.map
