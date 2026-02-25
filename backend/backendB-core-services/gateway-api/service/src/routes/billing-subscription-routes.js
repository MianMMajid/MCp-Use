import { readJsonBody } from "../helpers.js";
import {
  businessApiUnavailableResponse,
  proxyBusinessApiRequest,
} from "../core/business-api-client.js";

function buildPathWithQuery(basePath, c) {
  const url = new URL(c.req.url);
  const query = url.searchParams.toString();
  if (!query) {
    return basePath;
  }
  return `${basePath}?${query}`;
}

export function registerBillingSubscriptionRoutes(app) {
  app.get("/api/billing/subscription", async (c) => {
    const proxied = await proxyBusinessApiRequest(c, "/api/business/billing/subscription");
    if (proxied.proxied) {
      return c.json(proxied.payload, proxied.status);
    }
    return businessApiUnavailableResponse(c, proxied, "billing.subscription");
  });

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
    return businessApiUnavailableResponse(c, proxied, "billing.create_checkout_session");
  });

  app.post("/api/billing/portal-session", async (c) => {
    const proxied = await proxyBusinessApiRequest(c, "/api/business/billing/portal-session", {
      method: "POST",
    });
    if (proxied.proxied) {
      return c.json(proxied.payload, proxied.status);
    }
    return businessApiUnavailableResponse(c, proxied, "billing.portal_session");
  });

  app.get("/api/billing/invoices", async (c) => {
    const proxied = await proxyBusinessApiRequest(
      c,
      buildPathWithQuery("/api/business/billing/invoices", c)
    );
    if (proxied.proxied) {
      return c.json(proxied.payload, proxied.status);
    }
    return businessApiUnavailableResponse(c, proxied, "billing.invoices");
  });

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
    return businessApiUnavailableResponse(c, proxied, "billing.subscription_cancel");
  });

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
    return businessApiUnavailableResponse(c, proxied, "billing.subscription_resume");
  });
}
//# sourceMappingURL=billing-subscription-routes.js.map
