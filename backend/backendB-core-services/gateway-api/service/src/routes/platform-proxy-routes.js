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

async function proxyGet(c, businessPath, operation) {
  const proxied = await proxyBusinessApiRequest(c, businessPath);
  if (proxied.proxied) {
    return c.json(proxied.payload, proxied.status);
  }
  return businessApiUnavailableResponse(c, proxied, operation);
}

async function proxyPost(c, businessPath, operation) {
  const body = await readJsonBody(c);
  const proxied = await proxyBusinessApiRequest(c, businessPath, {
    method: "POST",
    body,
  });
  if (proxied.proxied) {
    return c.json(proxied.payload, proxied.status);
  }
  return businessApiUnavailableResponse(c, proxied, operation);
}

async function proxyPatch(c, businessPath, operation) {
  const body = await readJsonBody(c);
  const proxied = await proxyBusinessApiRequest(c, businessPath, {
    method: "PATCH",
    body,
  });
  if (proxied.proxied) {
    return c.json(proxied.payload, proxied.status);
  }
  return businessApiUnavailableResponse(c, proxied, operation);
}

async function proxyDelete(c, businessPath, operation) {
  const proxied = await proxyBusinessApiRequest(c, businessPath, {
    method: "DELETE",
  });
  if (proxied.proxied) {
    return c.json(proxied.payload, proxied.status);
  }
  return businessApiUnavailableResponse(c, proxied, operation);
}

export function registerPlatformProxyRoutes(app) {
  app.get("/api/org", async (c) =>
    proxyGet(c, "/api/business/org", "org.list")
  );
  app.post("/api/org", async (c) =>
    proxyPost(c, "/api/business/org", "org.create")
  );
  app.patch("/api/org/:orgId", async (c) =>
    proxyPatch(
      c,
      `/api/business/org/${encodeURIComponent(c.req.param("orgId"))}`,
      "org.update"
    )
  );
  app.get("/api/org/:orgId/members", async (c) =>
    proxyGet(
      c,
      `/api/business/org/${encodeURIComponent(c.req.param("orgId"))}/members`,
      "org.members.list"
    )
  );
  app.post("/api/org/:orgId/invites", async (c) =>
    proxyPost(
      c,
      `/api/business/org/${encodeURIComponent(c.req.param("orgId"))}/invites`,
      "org.invites.create"
    )
  );
  app.post("/api/org/invites/:inviteId/accept", async (c) =>
    proxyPost(
      c,
      `/api/business/org/invites/${encodeURIComponent(c.req.param("inviteId"))}/accept`,
      "org.invites.accept"
    )
  );
  app.delete("/api/org/:orgId/members/:userId", async (c) =>
    proxyDelete(
      c,
      `/api/business/org/${encodeURIComponent(c.req.param("orgId"))}/members/${encodeURIComponent(c.req.param("userId"))}`,
      "org.members.remove"
    )
  );
  app.get("/api/org/:orgId/roles", async (c) =>
    proxyGet(
      c,
      `/api/business/org/${encodeURIComponent(c.req.param("orgId"))}/roles`,
      "org.roles.list"
    )
  );
  app.post("/api/org/:orgId/roles/:roleId/assign", async (c) =>
    proxyPost(
      c,
      `/api/business/org/${encodeURIComponent(c.req.param("orgId"))}/roles/${encodeURIComponent(c.req.param("roleId"))}/assign`,
      "org.roles.assign"
    )
  );

  app.get("/api/user/api-keys", async (c) =>
    proxyGet(c, "/api/business/user/api-keys", "user.api_keys.list")
  );
  app.post("/api/user/api-keys", async (c) =>
    proxyPost(c, "/api/business/user/api-keys", "user.api_keys.create")
  );
  app.delete("/api/user/api-keys/:keyId", async (c) =>
    proxyDelete(
      c,
      `/api/business/user/api-keys/${encodeURIComponent(c.req.param("keyId"))}`,
      "user.api_keys.delete"
    )
  );

  app.get("/api/org/:orgId/service-accounts", async (c) =>
    proxyGet(
      c,
      `/api/business/org/${encodeURIComponent(c.req.param("orgId"))}/service-accounts`,
      "org.service_accounts.list"
    )
  );
  app.post("/api/org/:orgId/service-accounts", async (c) =>
    proxyPost(
      c,
      `/api/business/org/${encodeURIComponent(c.req.param("orgId"))}/service-accounts`,
      "org.service_accounts.create"
    )
  );
  app.post("/api/org/:orgId/service-accounts/:id/keys", async (c) =>
    proxyPost(
      c,
      `/api/business/org/${encodeURIComponent(c.req.param("orgId"))}/service-accounts/${encodeURIComponent(c.req.param("id"))}/keys`,
      "org.service_account_keys.create"
    )
  );
  app.delete("/api/org/:orgId/service-accounts/:id/keys/:keyId", async (c) =>
    proxyDelete(
      c,
      `/api/business/org/${encodeURIComponent(c.req.param("orgId"))}/service-accounts/${encodeURIComponent(c.req.param("id"))}/keys/${encodeURIComponent(c.req.param("keyId"))}`,
      "org.service_account_keys.delete"
    )
  );

  app.get("/api/entitlements", async (c) =>
    proxyGet(c, "/api/business/entitlements", "entitlements.get")
  );
  app.get("/api/usage/summary", async (c) =>
    proxyGet(c, "/api/business/usage/summary", "usage.summary")
  );
  app.get("/api/usage/timeseries", async (c) =>
    proxyGet(
      c,
      buildPathWithQuery("/api/business/usage/timeseries", c),
      "usage.timeseries"
    )
  );
  app.get("/api/limits", async (c) =>
    proxyGet(c, "/api/business/limits", "limits.get")
  );
  app.post("/api/limits/override", async (c) =>
    proxyPost(c, "/api/business/limits/override", "limits.override")
  );
}
