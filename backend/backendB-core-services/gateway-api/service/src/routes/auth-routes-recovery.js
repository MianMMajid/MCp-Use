import { readJsonBody } from "../helpers.js";
import {
  applyBusinessApiProxyHeaders,
  businessApiUnavailableResponse,
  proxyBusinessApiRequest,
} from "../core/business-api-client.js";

async function proxyAuthRecoveryRequest(c, operation, path) {
  const body = await readJsonBody(c);
  const proxied = await proxyBusinessApiRequest(c, path, {
    method: "POST",
    body,
  });
  if (!proxied.proxied) {
    return businessApiUnavailableResponse(c, proxied, operation);
  }
  applyBusinessApiProxyHeaders(c, proxied);
  return c.json(proxied.payload, proxied.status);
}

export function registerAuthRecoveryRoutes(app) {
  app.post("/api/auth/forgot-password", async (c) =>
    proxyAuthRecoveryRequest(c, "auth.forgot_password", "/api/business/auth/forgot-password")
  );

  app.post("/api/auth/reset-password", async (c) =>
    proxyAuthRecoveryRequest(c, "auth.reset_password", "/api/business/auth/reset-password")
  );

  app.post("/api/auth/verify-email/request", async (c) =>
    proxyAuthRecoveryRequest(
      c,
      "auth.verify_email_request",
      "/api/business/auth/verify-email/request"
    )
  );

  app.post("/api/auth/verify-email/confirm", async (c) =>
    proxyAuthRecoveryRequest(
      c,
      "auth.verify_email_confirm",
      "/api/business/auth/verify-email/confirm"
    )
  );
}
