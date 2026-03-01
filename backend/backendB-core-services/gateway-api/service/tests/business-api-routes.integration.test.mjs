// Set ALL required env vars for gateway-api config before import
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test";
process.env.STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO || "price_pro";
process.env.STRIPE_PRICE_TEAM = process.env.STRIPE_PRICE_TEAM || "price_team";
process.env.STRIPE_PRICE_ENTERPRISE = process.env.STRIPE_PRICE_ENTERPRISE || "price_enterprise";
process.env.STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || "pk_test_placeholder";
process.env.MAPLE_ALLOW_NO_AUTH = process.env.MAPLE_ALLOW_NO_AUTH || "1";
process.env.MAPLE_ALLOW_BRIDGE_OVERRIDE = process.env.MAPLE_ALLOW_BRIDGE_OVERRIDE || "0";
process.env.MAPLE_LOCK_BRIDGE_TARGET = process.env.MAPLE_LOCK_BRIDGE_TARGET || "0";
process.env.OPENCLAW_BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://127.0.0.1:8787";
process.env.OPENCLAW_BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "test-token";
process.env.MAPLE_OPENCLAW_AGENT_ENABLED = process.env.MAPLE_OPENCLAW_AGENT_ENABLED || "1";
process.env.MAPLE_OPENCLAW_AGENT_MODE = process.env.MAPLE_OPENCLAW_AGENT_MODE || "gateway";
process.env.MAPLE_OPENCLAW_AGENT_REQUIRED = process.env.MAPLE_OPENCLAW_AGENT_REQUIRED || "0";
process.env.MAPLE_OPENCLAW_AGENT_DEV_PROFILE = process.env.MAPLE_OPENCLAW_AGENT_DEV_PROFILE || "1";
process.env.MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY = process.env.MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY || "0";
process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_PORT = process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_PORT || "19001";
process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_BIND = process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_BIND || "loopback";
process.env.MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID = process.env.MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID || "agent-dev-main";
process.env.MAPLE_OPENCLAW_AGENT_DEFAULT_THINKING = process.env.MAPLE_OPENCLAW_AGENT_DEFAULT_THINKING || "medium";
process.env.MAPLE_OPENCLAW_AGENT_TIMEOUT_SECONDS = process.env.MAPLE_OPENCLAW_AGENT_TIMEOUT_SECONDS || "120";
process.env.MAPLE_OPENCLAW_MODIFIER_ENABLED = process.env.MAPLE_OPENCLAW_MODIFIER_ENABLED || "1";
process.env.MAPLE_OPENCLAW_MODIFIER_ALLOW_DEV_PROFILE = process.env.MAPLE_OPENCLAW_MODIFIER_ALLOW_DEV_PROFILE || "0";
process.env.MAPLE_OPENCLAW_MODIFIER_APPROVAL_TTL_SECONDS = process.env.MAPLE_OPENCLAW_MODIFIER_APPROVAL_TTL_SECONDS || "900";
process.env.MAPLE_OPENCLAW_MODIFIER_MAX_TIMEOUT_SECONDS = process.env.MAPLE_OPENCLAW_MODIFIER_MAX_TIMEOUT_SECONDS || "90";
process.env.MAPLE_OPENCLAW_MODIFIER_MAX_BUFFER_MB = process.env.MAPLE_OPENCLAW_MODIFIER_MAX_BUFFER_MB || "8";
process.env.MAPLE_OPENCLAW_MODIFIER_SOURCE_PROFILE = process.env.MAPLE_OPENCLAW_MODIFIER_SOURCE_PROFILE || "default";
process.env.MAPLE_OPENCLAW_MODIFIER_ALLOWED_TOOLS = process.env.MAPLE_OPENCLAW_MODIFIER_ALLOWED_TOOLS || "agent,agents,message,sessions,status,health,gateway,memory,models,skills,nodes,logs";
process.env.MAPLE_OPENCLAW_MODIFIER_DANGEROUS_TOOLS = process.env.MAPLE_OPENCLAW_MODIFIER_DANGEROUS_TOOLS || "setup,onboard,configure,config,reset,uninstall,update,plugins,webhooks,hooks,pairing,devices,node,sandbox,daemon,voicecall,acp,system,directory,dns,browser,cron";
process.env.MAPLE_OPENCLAW_MODIFIER_BLOCKED_TARGET_PROFILES = process.env.MAPLE_OPENCLAW_MODIFIER_BLOCKED_TARGET_PROFILES || "default,main,primary,root,system";
process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_SCOPE = process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_SCOPE || "1";
process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_ORG_RBAC = process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_ORG_RBAC || "1";
process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_TENANT_POLICY = process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_TENANT_POLICY || "0";
process.env.MAPLE_OPENCLAW_MODIFIER_AUTO_BOOTSTRAP_OWNER = process.env.MAPLE_OPENCLAW_MODIFIER_AUTO_BOOTSTRAP_OWNER || "1";
process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX = process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX || "1";
process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_INTERVAL_MS = process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_INTERVAL_MS || "5000";
process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_BATCH_SIZE = process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_BATCH_SIZE || "50";
process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_MAX_RETRIES = process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_MAX_RETRIES || "5";
process.env.MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS = process.env.MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS || "0";
process.env.MAPLE_ESCALATION_CHECK_INTERVAL_MS = process.env.MAPLE_ESCALATION_CHECK_INTERVAL_MS || "30000";
process.env.MAPLE_RETENTION_CHECK_INTERVAL_MS = process.env.MAPLE_RETENTION_CHECK_INTERVAL_MS || "86400000";
process.env.MAPLE_MODIFIER_GOVERNANCE_ENABLED = process.env.MAPLE_MODIFIER_GOVERNANCE_ENABLED || "0";
process.env.MAPLE_LEADER_ELECTION_ENABLED = process.env.MAPLE_LEADER_ELECTION_ENABLED || "1";
process.env.MAPLE_OTLP_ENDPOINT = process.env.MAPLE_OTLP_ENDPOINT || "http://localhost:4318";
process.env.MAPLE_OTLP_SERVICE_NAME = process.env.MAPLE_OTLP_SERVICE_NAME || "gateway-api";
process.env.MAPLE_OTLP_BATCH_SIZE = process.env.MAPLE_OTLP_BATCH_SIZE || "100";
process.env.MAPLE_OTLP_FLUSH_INTERVAL_MS = process.env.MAPLE_OTLP_FLUSH_INTERVAL_MS || "5000";
process.env.MAPLE_OTLP_TIMEOUT_MS = process.env.MAPLE_OTLP_TIMEOUT_MS || "10000";
process.env.MAPLE_EVENT_TRANSPORT_BACKEND = process.env.MAPLE_EVENT_TRANSPORT_BACKEND || "pg";
process.env.MAPLE_REDIS_URL = process.env.MAPLE_REDIS_URL || "redis://localhost:6379";
process.env.MAPLE_FIREWALL_CHAT_PREFER_OPENCLAW = process.env.MAPLE_FIREWALL_CHAT_PREFER_OPENCLAW || "1";
process.env.MAPLE_FIREWALL_CHAT_STRICT_MODE = process.env.MAPLE_FIREWALL_CHAT_STRICT_MODE || "0";
process.env.MAPLE_SESSION_POLL = process.env.MAPLE_SESSION_POLL || "1";
process.env.MAPLE_SESSION_POLL_MS = process.env.MAPLE_SESSION_POLL_MS || "5000";
process.env.MAPLE_MCP_FIREWALL_DEFAULT_APP = process.env.MAPLE_MCP_FIREWALL_DEFAULT_APP || "default";
process.env.MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS = process.env.MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS || "0";
process.env.MAPLE_MCP_PROXY_ALLOW_HTTP = process.env.MAPLE_MCP_PROXY_ALLOW_HTTP || "0";
process.env.MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS = process.env.MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS || "0";
process.env.MAPLE_MCP_PROXY_DEFAULT_TARGET_URL = process.env.MAPLE_MCP_PROXY_DEFAULT_TARGET_URL || "http://localhost:3000";
process.env.MAPLE_MCP_PROXY_ALLOWED_HOSTS = process.env.MAPLE_MCP_PROXY_ALLOWED_HOSTS || "localhost";
process.env.MAPLE_MCP_EXECUTION_ORDER = process.env.MAPLE_MCP_EXECUTION_ORDER || "default";
process.env.MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS = process.env.MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS || "15000";
process.env.MAPLE_MCP_ROUTE_LOCK = process.env.MAPLE_MCP_ROUTE_LOCK || "0";
process.env.MAPLE_SESSION_OWNER_SCOPE = process.env.MAPLE_SESSION_OWNER_SCOPE || "auto";
process.env.MAPLE_ENABLE_DEMO_ROUTES = process.env.MAPLE_ENABLE_DEMO_ROUTES || "1";
process.env.MAPLE_ENABLE_JUDGE_UI = process.env.MAPLE_ENABLE_JUDGE_UI || "1";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-openai-key";
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-anthropic-key";
process.env.MAPLE_FIREWALL_CHAT_PRIMARY = process.env.MAPLE_FIREWALL_CHAT_PRIMARY || "openai";
process.env.MAPLE_FIREWALL_CHAT_OPENAI_MODEL = process.env.MAPLE_FIREWALL_CHAT_OPENAI_MODEL || "gpt-4o-mini";
process.env.MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL = process.env.MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL || "claude-sonnet-4-6";
process.env.MAPLE_FIREWALL_CHAT_TIMEOUT_MS = process.env.MAPLE_FIREWALL_CHAT_TIMEOUT_MS || "15000";
process.env.MAPLE_SESSION_COOKIE_NAME = process.env.MAPLE_SESSION_COOKIE_NAME || "maple_session";
process.env.MAPLE_SESSION_TTL_SECONDS = process.env.MAPLE_SESSION_TTL_SECONDS || "604800";
process.env.MAPLE_AUTH_ALLOW_SELF_SIGNUP = process.env.MAPLE_AUTH_ALLOW_SELF_SIGNUP || "0";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-google-client-id";
process.env.MAPLE_GPT_OAUTH_CLIENT_ID = process.env.MAPLE_GPT_OAUTH_CLIENT_ID || "maple-gpt-client";
process.env.MAPLE_GPT_OAUTH_CLIENT_SECRET = process.env.MAPLE_GPT_OAUTH_CLIENT_SECRET || "maple-secret";
process.env.GATEWAY_PORT = process.env.GATEWAY_PORT || "8443";
process.env.GATEWAY_HOST = process.env.GATEWAY_HOST || "0.0.0.0";
process.env.MAPLE_GATEWAY_TLS_CERT = process.env.MAPLE_GATEWAY_TLS_CERT || "/etc/maple/gateway-tls/tls.crt";
process.env.MAPLE_GATEWAY_TLS_KEY = process.env.MAPLE_GATEWAY_TLS_KEY || "/etc/maple/gateway-tls/tls.key";
process.env.MAPLE_GATEWAY_TLS_CA = process.env.MAPLE_GATEWAY_TLS_CA || "/etc/maple/gateway-tls/ca.crt";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://maple:maple@127.0.0.1:5432/maple_test";
process.env.CONTEXT_WALL_ADDRESS = process.env.CONTEXT_WALL_ADDRESS || "localhost:9000";
process.env.MODEL_ROUTER_ADDRESS = process.env.MODEL_ROUTER_ADDRESS || "localhost:9100";
process.env.MCP_PROXY_ADDRESS = process.env.MCP_PROXY_ADDRESS || "localhost:9200";
process.env.TOOL_RUNNER_ADDRESS = process.env.TOOL_RUNNER_ADDRESS || "localhost:9250";
process.env.CYBER_PROXY_ADDRESS = process.env.CYBER_PROXY_ADDRESS || "localhost:8080";
process.env.SECRETS_BROKER_ADDRESS = process.env.SECRETS_BROKER_ADDRESS || "localhost:9300";
process.env.AUDIT_WRITER_ADDRESS = process.env.AUDIT_WRITER_ADDRESS || "localhost:9400";
process.env.MAPLE_BUSINESS_API_BASE_URL = process.env.MAPLE_BUSINESS_API_BASE_URL || "http://localhost:9550";
process.env.MAPLE_BUSINESS_API_REQUIRED = process.env.MAPLE_BUSINESS_API_REQUIRED || "0";
process.env.MAPLE_BUSINESS_API_CA = process.env.MAPLE_BUSINESS_API_CA || "/etc/maple/tls/ca.crt";
process.env.MAPLE_BUSINESS_API_CERT = process.env.MAPLE_BUSINESS_API_CERT || "/etc/maple/gateway-tls/tls.crt";
process.env.MAPLE_BUSINESS_API_KEY = process.env.MAPLE_BUSINESS_API_KEY || "/etc/maple/gateway-tls/tls.key";
process.env.MAPLE_BUSINESS_API_TIMEOUT_MS = process.env.MAPLE_BUSINESS_API_TIMEOUT_MS || "3000";
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
process.env.MCP_URL = process.env.MCP_URL || "http://localhost:3000";
process.env.DOWNSTREAM_APPS = process.env.DOWNSTREAM_APPS || "";

import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { Hono } from "hono";

// Use dynamic imports so env vars are set before config.js is evaluated
const { registerAuthMeRoute } = await import("../src/routes/auth-routes-me.js");
const { registerAuthLoginRegisterRoutes } = await import("../src/routes/auth-routes-login-register.js");
const { registerAuthGoogleRoutes } = await import("../src/routes/auth-routes-google.js");
const { registerAuthLogoutRoute } = await import("../src/routes/auth-routes-logout.js");
const { registerAuthRecoveryRoutes } = await import("../src/routes/auth-routes-recovery.js");
const { registerBillingUserRoutes } = await import("../src/routes/billing-user-routes.js");
const { registerBillingSubscriptionRoutes } = await import("../src/routes/billing-subscription-routes.js");
const { registerBillingWebhookRoute } = await import("../src/routes/billing-webhook-route.js");
const { registerPlatformProxyRoutes } = await import("../src/routes/platform-proxy-routes.js");

function startBusinessApiStub() {
  const received = [];
  const integrationState = {
    github: {
      id: "integration-1",
      provider: "github",
      displayName: "GitHub",
      status: "disconnected",
      connected: false,
      authType: "oauth2",
      scopes: [],
      metadata: {},
    },
  };

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      received.push({
        method: req.method,
        path: req.url,
        body,
        headers: req.headers,
      });

      const ok = (payload, status = 200, headers = {}) => {
        res.statusCode = status;
        for (const [name, value] of Object.entries(headers)) {
          res.setHeader(name, value);
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(payload));
      };

      if (req.method === "POST" && req.url === "/api/business/auth/login") {
        ok(
          { ok: true, authenticated: true, method: "session", via: "business-api" },
          200,
          { "set-cookie": "maple_session=proxied-login; Path=/; HttpOnly" }
        );
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/auth/register") {
        ok(
          { ok: true, authenticated: true, method: "session", via: "business-api" },
          200,
          { "set-cookie": "maple_session=proxied-register; Path=/; HttpOnly" }
        );
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/auth/me") {
        ok({ ok: true, authenticated: true, method: "api_key", via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/integrations/catalog") {
        ok({
          ok: true,
          providers: [
            { provider: "github", displayName: "GitHub", defaultAuthType: "oauth2" },
            { provider: "slack", displayName: "Slack", defaultAuthType: "oauth2" },
          ],
          via: "business-api",
        });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/integrations") {
        ok({
          ok: true,
          items: Object.values(integrationState),
          via: "business-api",
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/integrations/github/connect") {
        integrationState.github = {
          ...integrationState.github,
          status: "connected",
          connected: true,
          scopes: ["repo:read"],
          metadata: { connectedVia: "test" },
        };
        ok({ ok: true, integration: integrationState.github, via: "business-api" }, 201);
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/integrations/github/disconnect") {
        integrationState.github = {
          ...integrationState.github,
          status: "disconnected",
          connected: false,
        };
        ok({ ok: true, integration: integrationState.github, via: "business-api" });
        return;
      }
      if (
        req.method === "GET" &&
        req.url?.startsWith("/api/business/integrations/github/oauth/start")
      ) {
        ok({
          ok: true,
          provider: "github",
          authorizationUrl:
            "https://github.com/login/oauth/authorize?client_id=gh-client&state=state-123",
          state: "state-123",
          redirectUri: "https://mayple.cloud/api/integrations/github/oauth/callback",
          via: "business-api",
        });
        return;
      }
      if (
        req.method === "GET" &&
        req.url?.startsWith("/api/business/integrations/github/oauth/callback")
      ) {
        ok({
          ok: true,
          provider: "github",
          redirectUrl: "https://mayple.cloud/journey?oauth=success&provider=github",
          integration: {
            ...integrationState.github,
            status: "connected",
            connected: true,
            metadata: {
              oauth: {
                provider: "github",
                hasRefreshToken: true,
              },
            },
          },
          via: "business-api",
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/integrations/github/oauth/refresh") {
        ok({
          ok: true,
          integration: {
            ...integrationState.github,
            status: "connected",
            connected: true,
            metadata: {
              oauth: {
                provider: "github",
                hasRefreshToken: true,
                lastRefreshAt: new Date().toISOString(),
              },
            },
          },
          via: "business-api",
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/integrations/github/oauth/revoke") {
        integrationState.github = {
          ...integrationState.github,
          status: "disconnected",
          connected: false,
        };
        ok({
          ok: true,
          integration: {
            ...integrationState.github,
            metadata: {
              oauth: {
                provider: "github",
                revokedAt: new Date().toISOString(),
              },
            },
          },
          via: "business-api",
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/auth/logout") {
        ok({ ok: true, via: "business-api" }, 200, {
          "set-cookie": "maple_session=; Path=/; HttpOnly; Max-Age=0",
        });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/auth/google/client-id") {
        ok({ clientId: "google-client", via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/auth/google") {
        ok({ ok: true, authenticated: true, via: "business-api" }, 200, {
          "set-cookie": "maple_session=proxied-google; Path=/; HttpOnly",
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/auth/forgot-password") {
        ok({ ok: true, via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/auth/reset-password") {
        ok({ ok: true, via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/auth/verify-email/request") {
        ok({ ok: true, via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/auth/verify-email/confirm") {
        ok({ ok: true, via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/user/profile") {
        ok({ ok: true, user: { id: "u1" }, subscription: { plan: "free" }, via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/user/change-password") {
        ok({ ok: true, via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/billing/subscription") {
        ok({ ok: true, billingEnabled: true, subscription: { plan: "team" }, via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/billing/create-checkout-session") {
        ok({ ok: true, url: "https://checkout.example/session", via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/billing/portal-session") {
        ok({ ok: true, url: "https://billing.example/portal", via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/api/business/billing/invoices")) {
        ok({
          ok: true,
          items: [
            {
              id: "in_1",
              status: "paid",
              amount: 2900,
              currency: "usd",
              createdAt: "2026-02-25T00:00:00.000Z",
              hostedInvoiceUrl: "https://billing.example/in_1",
            },
          ],
          nextCursor: "",
          via: "business-api",
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/billing/subscription/cancel") {
        ok({
          ok: true,
          status: "active",
          cancelAtPeriodEnd: true,
          currentPeriodEnd: "2026-03-25T00:00:00.000Z",
          via: "business-api",
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/billing/subscription/resume") {
        ok({
          ok: true,
          status: "active",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: "2026-03-25T00:00:00.000Z",
          via: "business-api",
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/billing/webhook") {
        ok({ received: true, via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/org") {
        ok({
          ok: true,
          items: [{ orgId: "org-1", name: "Maple Org", membersCount: 1 }],
          via: "business-api",
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/org") {
        ok({ ok: true, org: { orgId: "org-1", name: "Maple Org" }, via: "business-api" }, 201);
        return;
      }
      if (req.method === "PATCH" && req.url === "/api/business/org/org-1") {
        ok({ ok: true, org: { orgId: "org-1", name: "Maple Org v2" }, via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/org/org-1/members") {
        ok({ ok: true, items: [{ userId: "user-1", roleId: "owner" }], via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/org/org-1/invites") {
        ok({ ok: true, invite: { inviteId: "invite-1" }, via: "business-api" }, 201);
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/org/invites/invite-1/accept") {
        ok({ ok: true, invite: { inviteId: "invite-1", accepted: true }, via: "business-api" });
        return;
      }
      if (req.method === "DELETE" && req.url === "/api/business/org/org-1/members/user-2") {
        ok({ ok: true, removedUserId: "user-2", via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/org/org-1/roles") {
        ok({ ok: true, items: [{ roleId: "owner" }, { roleId: "member" }], via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/org/org-1/roles/member/assign") {
        ok({ ok: true, roleId: "member", userId: "user-2", via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/user/api-keys") {
        ok({ ok: true, items: [{ keyId: "key-1" }], via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/user/api-keys") {
        ok({ ok: true, key: { keyId: "key-2" }, via: "business-api" }, 201);
        return;
      }
      if (req.method === "DELETE" && req.url === "/api/business/user/api-keys/key-2") {
        ok({ ok: true, keyId: "key-2", via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/org/org-1/service-accounts") {
        ok({ ok: true, items: [{ accountId: "svc-1" }], via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/org/org-1/service-accounts") {
        ok({ ok: true, account: { accountId: "svc-2" }, via: "business-api" }, 201);
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/org/org-1/service-accounts/svc-2/keys") {
        ok({ ok: true, key: { keyId: "svc-key-1" }, via: "business-api" }, 201);
        return;
      }
      if (
        req.method === "DELETE" &&
        req.url === "/api/business/org/org-1/service-accounts/svc-2/keys/svc-key-1"
      ) {
        ok({ ok: true, keyId: "svc-key-1", via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/entitlements") {
        ok({ ok: true, plan: "team", features: ["tool-governance"], via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/usage/summary") {
        ok({ ok: true, summary: { runs: 12 }, via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/api/business/usage/timeseries")) {
        ok({ ok: true, points: [{ day: "2026-02-25", runs: 2 }], via: "business-api" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/business/limits") {
        ok({ ok: true, limits: { maxRunsPerDay: 100 }, via: "business-api" });
        return;
      }
      if (req.method === "POST" && req.url === "/api/business/limits/override") {
        ok({ ok: true, limits: { maxRunsPerDay: 250 }, via: "business-api" });
        return;
      }

      ok({ error: "Unhandled route", method: req.method, path: req.url }, 404);
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve stub server address"));
        return;
      }
      resolve({
        server,
        received,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

test("gateway auth/user/billing routes proxy to business-api endpoints", async () => {
  const previousBaseUrl = process.env.MAPLE_BUSINESS_API_BASE_URL;
  const previousRequired = process.env.MAPLE_BUSINESS_API_REQUIRED;

  const { server, received, baseUrl } = await startBusinessApiStub();
  process.env.MAPLE_BUSINESS_API_BASE_URL = baseUrl;
  process.env.MAPLE_BUSINESS_API_REQUIRED = "true";

  const app = new Hono();
  registerAuthMeRoute(app);
  registerAuthLoginRegisterRoutes(app);
  registerAuthGoogleRoutes(app);
  registerAuthLogoutRoute(app);
  registerAuthRecoveryRoutes(app);
  registerBillingUserRoutes(app);
  registerBillingSubscriptionRoutes(app);
  registerBillingWebhookRoute(app);
  registerPlatformProxyRoutes(app);

  try {
    const login = await app.request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "maple", password: "password" }),
    });
    assert.equal(login.status, 200);
    assert.equal(login.headers.get("set-cookie")?.includes("proxied-login"), true);

    const register = await app.request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "new", password: "password123" }),
    });
    assert.equal(register.status, 200);

    const me = await app.request("http://localhost/api/auth/me", {
      headers: { "x-api-key": "demo" },
    });
    assert.equal(me.status, 200);

    const logout = await app.request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie: "maple_session=s1" },
    });
    assert.equal(logout.status, 200);
    assert.equal(logout.headers.get("set-cookie")?.includes("Max-Age=0"), true);

    const googleClient = await app.request("http://localhost/api/auth/google/client-id");
    assert.equal(googleClient.status, 200);

    const googleLogin = await app.request("http://localhost/api/auth/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential: "token" }),
    });
    assert.equal(googleLogin.status, 200);

    const integrationCatalog = await app.request(
      "http://localhost/api/integrations/catalog"
    );
    assert.equal(integrationCatalog.status, 200);

    const integrationList = await app.request("http://localhost/api/integrations", {
      headers: { cookie: "maple_session=s1" },
    });
    assert.equal(integrationList.status, 200);

    const integrationConnect = await app.request(
      "http://localhost/api/integrations/github/connect",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "maple_session=s1",
        },
        body: JSON.stringify({ credential: "ghp_demo_123", scopes: ["repo:read"] }),
      }
    );
    assert.equal(integrationConnect.status, 201);

    const integrationDisconnect = await app.request(
      "http://localhost/api/integrations/github/disconnect",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "maple_session=s1",
        },
        body: JSON.stringify({}),
      }
    );
    assert.equal(integrationDisconnect.status, 200);

    const integrationOauthStart = await app.request(
      "http://localhost/api/integrations/github/oauth/start?returnTo=%2Fjourney"
    );
    assert.equal(integrationOauthStart.status, 200);
    const integrationOauthStartPayload = await integrationOauthStart.json();
    assert.equal(integrationOauthStartPayload.ok, true);
    assert.equal(
      integrationOauthStartPayload.authorizationUrl.includes("github.com/login/oauth/authorize"),
      true
    );

    const integrationOauthCallback = await app.request(
      "http://localhost/api/integrations/github/oauth/callback?code=abc&state=state-123"
    );
    assert.equal(integrationOauthCallback.status, 302);
    assert.equal(
      integrationOauthCallback.headers.get("location"),
      "https://mayple.cloud/journey?oauth=success&provider=github"
    );

    const integrationOauthRefresh = await app.request(
      "http://localhost/api/integrations/github/oauth/refresh",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "maple_session=s1",
        },
        body: JSON.stringify({}),
      }
    );
    assert.equal(integrationOauthRefresh.status, 200);

    const integrationOauthRevoke = await app.request(
      "http://localhost/api/integrations/github/oauth/revoke",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "maple_session=s1",
        },
        body: JSON.stringify({}),
      }
    );
    assert.equal(integrationOauthRevoke.status, 200);

    const forgotPassword = await app.request(
      "http://localhost/api/auth/forgot-password",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "maple@example.com",
          redirectUrl: "https://app.example.com/reset",
        }),
      }
    );
    assert.equal(forgotPassword.status, 200);

    const forgotPasswordAlias = await app.request(
      "http://localhost/api/auth/password-reset",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "maple@example.com",
          redirectUrl: "https://app.example.com/reset",
        }),
      }
    );
    assert.equal(forgotPasswordAlias.status, 200);

    const resetPassword = await app.request("http://localhost/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: "x".repeat(32),
        newPassword: "new-password-123",
      }),
    });
    assert.equal(resetPassword.status, 200);

    const verifyRequest = await app.request("http://localhost/api/auth/verify-email/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "maple@example.com" }),
    });
    assert.equal(verifyRequest.status, 200);

    const verifyConfirm = await app.request("http://localhost/api/auth/verify-email/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "x".repeat(32) }),
    });
    assert.equal(verifyConfirm.status, 200);

    const profile = await app.request("http://localhost/api/user/profile", {
      headers: { cookie: "maple_session=s1" },
    });
    assert.equal(profile.status, 200);
    const profilePayload = await profile.json();
    assert.equal(profilePayload.via, "business-api");

    const changePassword = await app.request("http://localhost/api/user/change-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "maple_session=s1",
      },
      body: JSON.stringify({
        currentPassword: "old",
        newPassword: "new-password-123",
      }),
    });
    assert.equal(changePassword.status, 200);

    const changePasswordAlias = await app.request("http://localhost/api/auth/change-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "maple_session=s1",
      },
      body: JSON.stringify({
        currentPassword: "old",
        newPassword: "new-password-123",
      }),
    });
    assert.equal(changePasswordAlias.status, 200);

    const subscription = await app.request("http://localhost/api/billing/subscription", {
      headers: { cookie: "maple_session=s1" },
    });
    assert.equal(subscription.status, 200);

    const checkout = await app.request("http://localhost/api/billing/create-checkout-session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "maple_session=s1",
      },
      body: JSON.stringify({ plan: "team" }),
    });
    assert.equal(checkout.status, 200);

    const portal = await app.request("http://localhost/api/billing/portal-session", {
      method: "POST",
      headers: { cookie: "maple_session=s1" },
    });
    assert.equal(portal.status, 200);

    const invoices = await app.request("http://localhost/api/billing/invoices?limit=20", {
      headers: { cookie: "maple_session=s1" },
    });
    assert.equal(invoices.status, 200);
    const invoicesPayload = await invoices.json();
    assert.equal(invoicesPayload.ok, true);
    assert.equal(Array.isArray(invoicesPayload.items), true);

    const cancelSubscription = await app.request(
      "http://localhost/api/billing/subscription/cancel",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "maple_session=s1",
        },
        body: JSON.stringify({ atPeriodEnd: true }),
      }
    );
    assert.equal(cancelSubscription.status, 200);

    const resumeSubscription = await app.request(
      "http://localhost/api/billing/subscription/resume",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "maple_session=s1",
        },
        body: JSON.stringify({}),
      }
    );
    assert.equal(resumeSubscription.status, 200);

    const orgs = await app.request("http://localhost/api/org", {
      headers: {
        cookie: "maple_session=s1",
        "x-tenant-id": "tenant-dev",
        "x-user-id": "user-42",
        "x-device-id": "device-42",
        "x-maple-session-id": "session-42",
        "x-trace-id": "trace-42",
      },
    });
    assert.equal(orgs.status, 200);
    const orgsPayload = await orgs.json();
    assert.equal(orgsPayload.ok, true);
    assert.equal(Array.isArray(orgsPayload.items), true);

    const createOrg = await app.request("http://localhost/api/org", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "maple_session=s1",
      },
      body: JSON.stringify({ name: "Maple Org" }),
    });
    assert.equal(createOrg.status, 201);

    const patchOrg = await app.request("http://localhost/api/org/org-1", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: "maple_session=s1",
      },
      body: JSON.stringify({ name: "Maple Org v2" }),
    });
    assert.equal(patchOrg.status, 200);

    assert.equal(
      (await app.request("http://localhost/api/org/org-1/members", { headers: { cookie: "maple_session=s1" } }))
        .status,
      200
    );
    assert.equal(
      (
        await app.request("http://localhost/api/org/org-1/invites", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "maple_session=s1" },
          body: JSON.stringify({ email: "member@example.com", roleId: "member" }),
        })
      ).status,
      201
    );
    assert.equal(
      (
        await app.request("http://localhost/api/org/invites/invite-1/accept", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "maple_session=s1" },
          body: JSON.stringify({}),
        })
      ).status,
      200
    );
    assert.equal(
      (
        await app.request("http://localhost/api/org/org-1/members/user-2", {
          method: "DELETE",
          headers: { cookie: "maple_session=s1" },
        })
      ).status,
      200
    );
    assert.equal(
      (await app.request("http://localhost/api/org/org-1/roles", { headers: { cookie: "maple_session=s1" } }))
        .status,
      200
    );
    assert.equal(
      (
        await app.request("http://localhost/api/org/org-1/roles/member/assign", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "maple_session=s1" },
          body: JSON.stringify({ userId: "user-2" }),
        })
      ).status,
      200
    );
    assert.equal(
      (await app.request("http://localhost/api/user/api-keys", { headers: { cookie: "maple_session=s1" } }))
        .status,
      200
    );
    assert.equal(
      (
        await app.request("http://localhost/api/user/api-keys", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "maple_session=s1" },
          body: JSON.stringify({ name: "automation" }),
        })
      ).status,
      201
    );
    assert.equal(
      (
        await app.request("http://localhost/api/user/api-keys/key-2", {
          method: "DELETE",
          headers: { cookie: "maple_session=s1" },
        })
      ).status,
      200
    );
    assert.equal(
      (
        await app.request("http://localhost/api/org/org-1/service-accounts", {
          headers: { cookie: "maple_session=s1" },
        })
      ).status,
      200
    );
    assert.equal(
      (
        await app.request("http://localhost/api/org/org-1/service-accounts", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "maple_session=s1" },
          body: JSON.stringify({ name: "bot-account" }),
        })
      ).status,
      201
    );
    assert.equal(
      (
        await app.request("http://localhost/api/org/org-1/service-accounts/svc-2/keys", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "maple_session=s1" },
          body: JSON.stringify({}),
        })
      ).status,
      201
    );
    assert.equal(
      (
        await app.request("http://localhost/api/org/org-1/service-accounts/svc-2/keys/svc-key-1", {
          method: "DELETE",
          headers: { cookie: "maple_session=s1" },
        })
      ).status,
      200
    );
    assert.equal(
      (await app.request("http://localhost/api/entitlements", { headers: { cookie: "maple_session=s1" } }))
        .status,
      200
    );
    assert.equal(
      (await app.request("http://localhost/api/usage/summary", { headers: { cookie: "maple_session=s1" } }))
        .status,
      200
    );
    assert.equal(
      (
        await app.request("http://localhost/api/usage/timeseries?days=7", {
          headers: { cookie: "maple_session=s1" },
        })
      ).status,
      200
    );
    assert.equal(
      (await app.request("http://localhost/api/limits", { headers: { cookie: "maple_session=s1" } }))
        .status,
      200
    );
    assert.equal(
      (
        await app.request("http://localhost/api/limits/override", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "maple_session=s1" },
          body: JSON.stringify({ maxRunsPerDay: 250 }),
        })
      ).status,
      200
    );

    const webhookBody = JSON.stringify({ event: "stripe" });
    const webhook = await app.request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1,v1=abc",
      },
      body: webhookBody,
    });
    assert.equal(webhook.status, 200);

    const proxiedWebhook = received.find(
      (entry) => entry.path === "/api/business/billing/webhook"
    );
    assert.equal(Boolean(proxiedWebhook), true);
    assert.equal(proxiedWebhook.body, webhookBody);
    assert.equal(proxiedWebhook.headers["stripe-signature"], "t=1,v1=abc");

    const proxiedInvoices = received.find(
      (entry) => entry.path === "/api/business/billing/invoices?limit=20"
    );
    assert.equal(Boolean(proxiedInvoices), true);

    const proxiedForgotPassword = received.find(
      (entry) => entry.path === "/api/business/auth/forgot-password"
    );
    assert.equal(Boolean(proxiedForgotPassword), true);
    assert.equal(proxiedForgotPassword.method, "POST");

    const proxiedIntegrationConnect = received.find(
      (entry) => entry.path === "/api/business/integrations/github/connect"
    );
    assert.equal(Boolean(proxiedIntegrationConnect), true);
    assert.equal(proxiedIntegrationConnect.method, "POST");

    const proxiedOrgList = received.find((entry) => entry.path === "/api/business/org");
    assert.equal(Boolean(proxiedOrgList), true);
    assert.equal(proxiedOrgList.headers["x-maple-tenant-id"], "tenant-dev");
    assert.equal(proxiedOrgList.headers["x-maple-user-id"], "user-42");
    assert.equal(proxiedOrgList.headers["x-maple-device-id"], "device-42");
    assert.equal(proxiedOrgList.headers["x-maple-session-id"], "session-42");
    assert.equal(proxiedOrgList.headers["x-trace-id"], "trace-42");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousBaseUrl === undefined) {
      delete process.env.MAPLE_BUSINESS_API_BASE_URL;
    } else {
      process.env.MAPLE_BUSINESS_API_BASE_URL = previousBaseUrl;
    }
    if (previousRequired === undefined) {
      delete process.env.MAPLE_BUSINESS_API_REQUIRED;
    } else {
      process.env.MAPLE_BUSINESS_API_REQUIRED = previousRequired;
    }
  }
});

test("gateway returns 503 when business-api is required but unavailable", async () => {
  const previousBaseUrl = process.env.MAPLE_BUSINESS_API_BASE_URL;
  const previousRequired = process.env.MAPLE_BUSINESS_API_REQUIRED;
  process.env.MAPLE_BUSINESS_API_BASE_URL = "http://127.0.0.1:9";
  process.env.MAPLE_BUSINESS_API_REQUIRED = "true";

  const app = new Hono();
  registerBillingUserRoutes(app);
  registerAuthRecoveryRoutes(app);

  try {
    const response = await app.request("http://localhost/api/user/profile", {
      headers: { cookie: "maple_session=s1" },
    });
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.error, "Business API unavailable");

    const forgotResponse = await app.request("http://localhost/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "maple@example.com",
        redirectUrl: "https://app.example.com/reset",
      }),
    });
    assert.equal(forgotResponse.status, 503);
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.MAPLE_BUSINESS_API_BASE_URL;
    } else {
      process.env.MAPLE_BUSINESS_API_BASE_URL = previousBaseUrl;
    }
    if (previousRequired === undefined) {
      delete process.env.MAPLE_BUSINESS_API_REQUIRED;
    } else {
      process.env.MAPLE_BUSINESS_API_REQUIRED = previousRequired;
    }
  }
});
