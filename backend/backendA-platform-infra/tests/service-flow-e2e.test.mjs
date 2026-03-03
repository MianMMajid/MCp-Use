import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import net from "node:net";
import { dirname, resolve } from "node:path";
import test from "node:test";

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { startGrpcServer } from "@maple/common";

const PROTO_ROOT = resolve("backend/proto");

function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        rejectPort(new Error("Unable to resolve free port"));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          rejectPort(error);
          return;
        }
        resolvePort(port);
      });
    });
    server.on("error", rejectPort);
  });
}

async function waitFor(condition, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (condition()) {
      return;
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
  }
  throw new Error("Timed out waiting for condition");
}

function loadProto(protoPath) {
  const absolute = resolve(PROTO_ROOT, protoPath);
  const packageDefinition = protoLoader.loadSync(absolute, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_ROOT, resolve(PROTO_ROOT, "maple"), resolve(PROTO_ROOT, dirname(protoPath))],
  });
  return grpc.loadPackageDefinition(packageDefinition);
}

async function startServer(server, port, serviceName) {
  await startGrpcServer(server, {
    host: "127.0.0.1",
    port,
    serviceName,
  });
}

function suppressExpectedRuntimeLogs() {
  const originalError = console.error;

  console.error = (...args) => {
    const message = String(args[0] ?? "");
    if (message.startsWith("[DB] PostgreSQL initialization failed:")) {
      return;
    }
    originalError(...args);
  };

  return () => {
    console.error = originalError;
  };
}

test("e2e mesh flow covers gateway -> context-wall -> mcp-proxy -> tool-runner -> cyber-proxy", async () => {
  const restoreLogs = suppressExpectedRuntimeLogs();
  const ports = {
    contextWall: await getFreePort(),
    modelRouter: await getFreePort(),
    mcpProxy: await getFreePort(),
    toolRunner: await getFreePort(),
    cyberProxy: await getFreePort(),
    secretsBroker: await getFreePort(),
    auditWriter: await getFreePort(),
    downstreamMcp: await getFreePort(),
  };

  const certScript = resolve("backend/backendA-platform-infra/scripts/generate-local-certs.sh");
  const certDir = resolve("backend/backendA-platform-infra/certs");
  const certResult = spawnSync("bash", [certScript], {
    env: { ...process.env, MAPLE_FORCE_CERT_REGEN: "0" },
    encoding: "utf8",
  });
  if (certResult.status !== 0) {
    throw new Error(`Cert generation failed: ${certResult.stderr || certResult.stdout}`);
  }

  const envKeys = [
    "MAPLE_GRPC_TLS_CERT",
    "MAPLE_GRPC_TLS_KEY",
    "MAPLE_GRPC_TLS_CA",
    "MAPLE_ALLOW_NO_AUTH",
    "MAPLE_DISABLE_HITL_BROKER",
    "MAPLE_SKIP_AUTH_BOOTSTRAP",
    "PGCONNECT_TIMEOUT",
    "DATABASE_URL",
    "OPENAI_API_KEY",
    "CONTEXT_WALL_ADDRESS",
    "MODEL_ROUTER_ADDRESS",
    "MCP_PROXY_ADDRESS",
    "TOOL_RUNNER_ADDRESS",
    "CYBER_PROXY_ADDRESS",
    "SECRETS_BROKER_ADDRESS",
    "AUDIT_WRITER_ADDRESS",
    "MAPLE_TOOL_RUNNER_MODE",
    "MAPLE_DOWNSTREAM_APPS",
    "MAPLE_FIREWALL_CHAT_PREFER_OPENCLAW",
    "MAPLE_MODEL_ROUTER_RETIRED",
    "MAPLE_SECRETS_BROKER_RETIRED",
    "CONTEXT_WALL_HITL_TIMEOUT_MS",
    "CONTEXT_WALL_PORT",
    "CONTEXT_WALL_HOST",
    "MODEL_ROUTER_PORT",
    "MODEL_ROUTER_HOST",
    "DEFAULT_MODEL",
    "MCP_PROXY_PORT",
    "MCP_PROXY_HOST",
    "DOWNSTREAM_APPS",
    "MAPLE_TOOL_RUNNER_IMAGE",
    "MAPLE_TOOL_RUNNER_JOB_NAMESPACE",
    "TOOL_RUNNER_PORT",
    "TOOL_RUNNER_HOST",
    "CYBER_PROXY_PORT",
    "CYBER_PROXY_HOST",
    "CYBER_ALLOWED_DOMAINS",
    "CYBER_BLOCKED_DOMAINS",
    "CYBER_TOOL_ALLOWED_DOMAINS_JSON",
    "CYBER_MAX_RESPONSE_BYTES",
    "CYBER_QUARANTINE_ENABLED",
    "SECRETS_BROKER_PORT",
    "SECRETS_BROKER_HOST",
    "AUDIT_WRITER_PORT",
    "AUDIT_WRITER_HTTP_PORT",
    "AUDIT_WRITER_HOST",
    // ── Gateway-API config.js required env vars ──
    "NODE_ENV",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_PRO",
    "STRIPE_PRICE_TEAM",
    "STRIPE_PRICE_ENTERPRISE",
    "STRIPE_PUBLISHABLE_KEY",
    "MAPLE_ALLOW_BRIDGE_OVERRIDE",
    "MAPLE_LOCK_BRIDGE_TARGET",
    "OPENCLAW_BRIDGE_URL",
    "OPENCLAW_BRIDGE_TOKEN",
    "MAPLE_OPENCLAW_AGENT_ENABLED",
    "MAPLE_OPENCLAW_AGENT_MODE",
    "MAPLE_OPENCLAW_AGENT_REQUIRED",
    "MAPLE_OPENCLAW_AGENT_DEV_PROFILE",
    "MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY",
    "MAPLE_OPENCLAW_AGENT_GATEWAY_PORT",
    "MAPLE_OPENCLAW_AGENT_GATEWAY_BIND",
    "MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID",
    "MAPLE_OPENCLAW_AGENT_DEFAULT_THINKING",
    "MAPLE_OPENCLAW_AGENT_TIMEOUT_SECONDS",
    "MAPLE_OPENCLAW_MODIFIER_ENABLED",
    "MAPLE_OPENCLAW_MODIFIER_ALLOW_DEV_PROFILE",
    "MAPLE_OPENCLAW_MODIFIER_APPROVAL_TTL_SECONDS",
    "MAPLE_OPENCLAW_MODIFIER_MAX_TIMEOUT_SECONDS",
    "MAPLE_OPENCLAW_MODIFIER_MAX_BUFFER_MB",
    "MAPLE_OPENCLAW_MODIFIER_SOURCE_PROFILE",
    "MAPLE_OPENCLAW_MODIFIER_ALLOWED_TOOLS",
    "MAPLE_OPENCLAW_MODIFIER_DANGEROUS_TOOLS",
    "MAPLE_OPENCLAW_MODIFIER_BLOCKED_TARGET_PROFILES",
    "MAPLE_OPENCLAW_MODIFIER_REQUIRE_SCOPE",
    "MAPLE_OPENCLAW_MODIFIER_REQUIRE_ORG_RBAC",
    "MAPLE_OPENCLAW_MODIFIER_REQUIRE_TENANT_POLICY",
    "MAPLE_OPENCLAW_MODIFIER_AUTO_BOOTSTRAP_OWNER",
    "MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX",
    "MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_INTERVAL_MS",
    "MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_BATCH_SIZE",
    "MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_MAX_RETRIES",
    "MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS",
    "MAPLE_ESCALATION_CHECK_INTERVAL_MS",
    "MAPLE_RETENTION_CHECK_INTERVAL_MS",
    "MAPLE_MODIFIER_GOVERNANCE_ENABLED",
    "MAPLE_LEADER_ELECTION_ENABLED",
    "MAPLE_OTLP_ENDPOINT",
    "MAPLE_OTLP_SERVICE_NAME",
    "MAPLE_OTLP_BATCH_SIZE",
    "MAPLE_OTLP_FLUSH_INTERVAL_MS",
    "MAPLE_OTLP_TIMEOUT_MS",
    "MAPLE_EVENT_TRANSPORT_BACKEND",
    "MAPLE_REDIS_URL",
    "MAPLE_FIREWALL_CHAT_STRICT_MODE",
    "MAPLE_SESSION_POLL",
    "MAPLE_SESSION_POLL_MS",
    "MAPLE_MCP_FIREWALL_DEFAULT_APP",
    "MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS",
    "MAPLE_MCP_PROXY_ALLOW_HTTP",
    "MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS",
    "MAPLE_MCP_PROXY_DEFAULT_TARGET_URL",
    "MAPLE_MCP_PROXY_ALLOWED_HOSTS",
    "MAPLE_MCP_EXECUTION_ORDER",
    "MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS",
    "MAPLE_MCP_ROUTE_LOCK",
    "MAPLE_SESSION_OWNER_SCOPE",
    "MAPLE_ENABLE_DEMO_ROUTES",
    "MAPLE_ENABLE_JUDGE_UI",
    "ANTHROPIC_API_KEY",
    "MAPLE_FIREWALL_CHAT_PRIMARY",
    "MAPLE_FIREWALL_CHAT_OPENAI_MODEL",
    "MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL",
    "MAPLE_FIREWALL_CHAT_TIMEOUT_MS",
    "MAPLE_SESSION_COOKIE_NAME",
    "MAPLE_SESSION_TTL_SECONDS",
    "MAPLE_AUTH_ALLOW_SELF_SIGNUP",
    "GOOGLE_CLIENT_ID",
    "MAPLE_GPT_OAUTH_CLIENT_ID",
    "MAPLE_GPT_OAUTH_CLIENT_SECRET",
    "GATEWAY_PORT",
    "GATEWAY_HOST",
    "MAPLE_GATEWAY_TLS_CERT",
    "MAPLE_GATEWAY_TLS_KEY",
    "MAPLE_GATEWAY_TLS_CA",
    "MAPLE_BUSINESS_API_BASE_URL",
    "MAPLE_BUSINESS_API_REQUIRED",
    "MAPLE_BUSINESS_API_CA",
    "MAPLE_BUSINESS_API_CERT",
    "MAPLE_BUSINESS_API_KEY",
    "MAPLE_BUSINESS_API_TIMEOUT_MS",
    "CORS_ORIGIN",
    "MAPLE_LOG_LEVEL",
    "MAPLE_LOG_INCLUDE_BODIES",
    "MAPLE_LOG_REQUESTS",
    "MAPLE_LOG_BODY_MAX_CHARS",
    "MAPLE_TENANT_CLAIM_SIGNING_KEY",
    "MAPLE_DISABLE_AUDIT_EMIT",
    "MAPLE_ADMIN_ALLOW_NO_AUTH",
    "MCP_URL",
  ];
  const envBackup = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  process.env.MAPLE_GRPC_TLS_CERT = resolve(certDir, "tls.crt");
  process.env.MAPLE_GRPC_TLS_KEY = resolve(certDir, "tls.key");
  process.env.MAPLE_GRPC_TLS_CA = resolve(certDir, "ca.crt");
  process.env.MAPLE_ALLOW_NO_AUTH = "true";
  process.env.MAPLE_DISABLE_HITL_BROKER = "1";
  process.env.MAPLE_SKIP_AUTH_BOOTSTRAP = "1";
  process.env.PGCONNECT_TIMEOUT = "1";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://maple:maple@127.0.0.1:5432/maple_test";
  process.env.OPENAI_API_KEY = "test-key-for-grpc-path";

  process.env.CONTEXT_WALL_ADDRESS = `localhost:${ports.contextWall}`;
  process.env.MODEL_ROUTER_ADDRESS = `localhost:${ports.modelRouter}`;
  process.env.MCP_PROXY_ADDRESS = `localhost:${ports.mcpProxy}`;
  process.env.TOOL_RUNNER_ADDRESS = `localhost:${ports.toolRunner}`;
  process.env.CYBER_PROXY_ADDRESS = `localhost:${ports.cyberProxy}`;
  process.env.SECRETS_BROKER_ADDRESS = `localhost:${ports.secretsBroker}`;
  process.env.AUDIT_WRITER_ADDRESS = `localhost:${ports.auditWriter}`;
  process.env.MAPLE_MODEL_ROUTER_RETIRED = "0";
  process.env.MAPLE_SECRETS_BROKER_RETIRED = "0";
  // Service ports (required by each service's config.js)
  process.env.CONTEXT_WALL_PORT = String(ports.contextWall);
  process.env.CONTEXT_WALL_HOST = "0.0.0.0";
  process.env.CONTEXT_WALL_HITL_TIMEOUT_MS = process.env.CONTEXT_WALL_HITL_TIMEOUT_MS || "1000";
  process.env.MODEL_ROUTER_PORT = String(ports.modelRouter);
  process.env.MODEL_ROUTER_HOST = "0.0.0.0";
  process.env.DEFAULT_MODEL = "gpt-4o";
  process.env.MCP_PROXY_PORT = String(ports.mcpProxy);
  process.env.MCP_PROXY_HOST = "0.0.0.0";
  process.env.DOWNSTREAM_APPS = "none";
  process.env.MAPLE_TOOL_RUNNER_IMAGE = "tool-runner:latest";
  process.env.MAPLE_TOOL_RUNNER_JOB_NAMESPACE = "maple-tools";
  process.env.TOOL_RUNNER_PORT = String(ports.toolRunner);
  process.env.TOOL_RUNNER_HOST = "0.0.0.0";
  process.env.CYBER_PROXY_PORT = String(ports.cyberProxy);
  process.env.CYBER_PROXY_HOST = "0.0.0.0";
  process.env.CYBER_ALLOWED_DOMAINS = "example.com";
  process.env.CYBER_BLOCKED_DOMAINS = "evil.com";
  process.env.CYBER_TOOL_ALLOWED_DOMAINS_JSON = "{}";
  process.env.CYBER_MAX_RESPONSE_BYTES = "10485760";
  process.env.CYBER_QUARANTINE_ENABLED = "1";
  process.env.SECRETS_BROKER_PORT = String(ports.secretsBroker);
  process.env.SECRETS_BROKER_HOST = "0.0.0.0";
  process.env.AUDIT_WRITER_PORT = String(ports.auditWriter);
  process.env.AUDIT_WRITER_HTTP_PORT = String(await getFreePort());
  process.env.AUDIT_WRITER_HOST = "0.0.0.0";
  process.env.MAPLE_TOOL_RUNNER_MODE = "service";
  process.env.MAPLE_FIREWALL_CHAT_PREFER_OPENCLAW = "0";
  process.env.CONTEXT_WALL_HITL_TIMEOUT_MS = "1000";
  // ── Gateway-API config.js required env vars ──
  process.env.NODE_ENV = "test";
  process.env.STRIPE_SECRET_KEY = "sk_test_ci_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_ci_test";
  process.env.STRIPE_PRICE_PRO = "price_pro_ci";
  process.env.STRIPE_PRICE_TEAM = "price_team_ci";
  process.env.STRIPE_PRICE_ENTERPRISE = "price_enterprise_ci";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_ci_placeholder";
  process.env.MAPLE_ALLOW_BRIDGE_OVERRIDE = "0";
  process.env.MAPLE_LOCK_BRIDGE_TARGET = "0";
  process.env.OPENCLAW_BRIDGE_URL = "http://127.0.0.1:8787";
  process.env.OPENCLAW_BRIDGE_TOKEN = "ci-test-bridge-token";
  process.env.MAPLE_OPENCLAW_AGENT_ENABLED = "1";
  process.env.MAPLE_OPENCLAW_AGENT_MODE = "gateway";
  process.env.MAPLE_OPENCLAW_AGENT_REQUIRED = "0";
  process.env.MAPLE_OPENCLAW_AGENT_DEV_PROFILE = "1";
  process.env.MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY = "0";
  process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_PORT = "19001";
  process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_BIND = "loopback";
  process.env.MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID = "agent-dev-main";
  process.env.MAPLE_OPENCLAW_AGENT_DEFAULT_THINKING = "medium";
  process.env.MAPLE_OPENCLAW_AGENT_TIMEOUT_SECONDS = "120";
  process.env.MAPLE_OPENCLAW_MODIFIER_ENABLED = "1";
  process.env.MAPLE_OPENCLAW_MODIFIER_ALLOW_DEV_PROFILE = "0";
  process.env.MAPLE_OPENCLAW_MODIFIER_APPROVAL_TTL_SECONDS = "900";
  process.env.MAPLE_OPENCLAW_MODIFIER_MAX_TIMEOUT_SECONDS = "90";
  process.env.MAPLE_OPENCLAW_MODIFIER_MAX_BUFFER_MB = "8";
  process.env.MAPLE_OPENCLAW_MODIFIER_SOURCE_PROFILE = "default";
  process.env.MAPLE_OPENCLAW_MODIFIER_ALLOWED_TOOLS = "agent,agents,message,sessions,status,health,gateway,memory,models,skills,nodes,logs";
  process.env.MAPLE_OPENCLAW_MODIFIER_DANGEROUS_TOOLS = "setup,onboard,configure,config,reset,uninstall,update,plugins,webhooks,hooks,pairing,devices,node,sandbox,daemon,voicecall,acp,system,directory,dns,browser,cron";
  process.env.MAPLE_OPENCLAW_MODIFIER_BLOCKED_TARGET_PROFILES = "default,main,primary,root,system";
  process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_SCOPE = "1";
  process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_ORG_RBAC = "1";
  process.env.MAPLE_OPENCLAW_MODIFIER_REQUIRE_TENANT_POLICY = "0";
  process.env.MAPLE_OPENCLAW_MODIFIER_AUTO_BOOTSTRAP_OWNER = "1";
  process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX = "1";
  process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_INTERVAL_MS = "5000";
  process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_BATCH_SIZE = "50";
  process.env.MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_MAX_RETRIES = "5";
  process.env.MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS = "0";
  process.env.MAPLE_ESCALATION_CHECK_INTERVAL_MS = "30000";
  process.env.MAPLE_RETENTION_CHECK_INTERVAL_MS = "86400000";
  process.env.MAPLE_MODIFIER_GOVERNANCE_ENABLED = "0";
  process.env.MAPLE_LEADER_ELECTION_ENABLED = "1";
  process.env.MAPLE_OTLP_ENDPOINT = "http://localhost:4318";
  process.env.MAPLE_OTLP_SERVICE_NAME = "gateway-api";
  process.env.MAPLE_OTLP_BATCH_SIZE = "100";
  process.env.MAPLE_OTLP_FLUSH_INTERVAL_MS = "5000";
  process.env.MAPLE_OTLP_TIMEOUT_MS = "5000";
  process.env.MAPLE_EVENT_TRANSPORT_BACKEND = "pg";
  process.env.MAPLE_REDIS_URL = "redis://localhost:6379";
  process.env.MAPLE_FIREWALL_CHAT_STRICT_MODE = "0";
  process.env.MAPLE_SESSION_POLL = "1";
  process.env.MAPLE_SESSION_POLL_MS = "5000";
  process.env.MAPLE_MCP_FIREWALL_DEFAULT_APP = "default";
  process.env.MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS = "0";
  process.env.MAPLE_MCP_PROXY_ALLOW_HTTP = "0";
  process.env.MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS = "0";
  process.env.MAPLE_MCP_PROXY_DEFAULT_TARGET_URL = "http://localhost:3000";
  process.env.MAPLE_MCP_PROXY_ALLOWED_HOSTS = "localhost";
  process.env.MAPLE_MCP_EXECUTION_ORDER = "default";
  process.env.MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS = "15000";
  process.env.MAPLE_MCP_ROUTE_LOCK = "0";
  process.env.MAPLE_SESSION_OWNER_SCOPE = "auto";
  process.env.MAPLE_ENABLE_DEMO_ROUTES = "1";
  process.env.MAPLE_ENABLE_JUDGE_UI = "1";
  process.env.ANTHROPIC_API_KEY = "ci-test-anthropic-key";
  process.env.MAPLE_FIREWALL_CHAT_PRIMARY = "openai";
  process.env.MAPLE_FIREWALL_CHAT_OPENAI_MODEL = "gpt-4o-mini";
  process.env.MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
  process.env.MAPLE_FIREWALL_CHAT_TIMEOUT_MS = "15000";
  process.env.MAPLE_SESSION_COOKIE_NAME = "maple_session";
  process.env.MAPLE_SESSION_TTL_SECONDS = "604800";
  process.env.MAPLE_AUTH_ALLOW_SELF_SIGNUP = "0";
  process.env.GOOGLE_CLIENT_ID = "ci-test-google-client-id";
  process.env.MAPLE_GPT_OAUTH_CLIENT_ID = "maple-gpt-client";
  process.env.MAPLE_GPT_OAUTH_CLIENT_SECRET = "maple-secret";
  process.env.GATEWAY_PORT = "8443";
  process.env.GATEWAY_HOST = "0.0.0.0";
  process.env.MAPLE_GATEWAY_TLS_CERT = resolve(certDir, "tls.crt");
  process.env.MAPLE_GATEWAY_TLS_KEY = resolve(certDir, "tls.key");
  process.env.MAPLE_GATEWAY_TLS_CA = resolve(certDir, "ca.crt");
  process.env.MAPLE_BUSINESS_API_BASE_URL = "http://localhost:9550";
  process.env.MAPLE_BUSINESS_API_REQUIRED = "0";
  process.env.MAPLE_BUSINESS_API_CA = resolve(certDir, "ca.crt");
  process.env.MAPLE_BUSINESS_API_CERT = resolve(certDir, "tls.crt");
  process.env.MAPLE_BUSINESS_API_KEY = resolve(certDir, "tls.key");
  process.env.MAPLE_BUSINESS_API_TIMEOUT_MS = "3000";
  process.env.CORS_ORIGIN = "*";
  process.env.MAPLE_LOG_LEVEL = "error";
  process.env.MAPLE_LOG_INCLUDE_BODIES = "0";
  process.env.MAPLE_LOG_REQUESTS = "0";
  process.env.MAPLE_LOG_BODY_MAX_CHARS = "4000";
  process.env.MAPLE_TENANT_CLAIM_SIGNING_KEY = "ci-test-tenant-key";
  process.env.MAPLE_DISABLE_AUDIT_EMIT = "1";
  process.env.MAPLE_ADMIN_ALLOW_NO_AUTH = "0";
  process.env.MCP_URL = "http://localhost:3000";
  process.env.MAPLE_DOWNSTREAM_APPS = JSON.stringify([
    {
      id: "web-app",
      name: "Web App",
      mcpUrl: `http://127.0.0.1:${ports.downstreamMcp}/mcp`,
      tools: [
        {
          name: "web_search",
          description: "Search the web",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
          },
        },
      ],
    },
  ]);

  const startedServers = [];
  let downstreamMcpServer;
  const auditEvents = [];
  let modelGenerateCalls = 0;
  let mintCredentialCalls = 0;
  const clientCleanupFns = [];
  let shutdownGateway = async () => {};
  let restoreGatewayPersistence = async () => {};

  try {
    downstreamMcpServer = createHttpServer((req, res) => {
      if (req.method !== "POST" || req.url !== "/mcp") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }

      let rawBody = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        rawBody += chunk;
      });
      req.on("end", () => {
        let payload = {};
        try {
          payload = JSON.parse(rawBody || "{}");
        } catch {
          payload = {};
        }
        const id = "id" in payload ? payload.id : null;
        const method = String(payload?.method || "");

        if (method === "tools/list") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id,
              result: {
                tools: [
                  {
                    name: "web_search",
                    description: "Search the web",
                    inputSchema: {
                      type: "object",
                      properties: { query: { type: "string" } },
                    },
                  },
                ],
              },
            })
          );
          return;
        }

        if (method === "tools/call") {
          const query = String(payload?.params?.arguments?.query || "unknown");
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: `stub-result:${query}`,
                  },
                ],
              },
            })
          );
          return;
        }

        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: "Method not found" },
          })
        );
      });
    });

    await new Promise((resolveListen, rejectListen) => {
      downstreamMcpServer.once("error", rejectListen);
      downstreamMcpServer.listen(ports.downstreamMcp, "127.0.0.1", () => {
        downstreamMcpServer.off("error", rejectListen);
        resolveListen();
      });
    });

    const auditProto = loadProto("maple/audit/v1/audit_writer.proto").maple.audit.v1;
    const auditServer = new grpc.Server();
    auditServer.addService(auditProto.AuditWriterService.service, {
      appendEvent(call, callback) {
        const event = call.request?.event ?? {};
        auditEvents.push(event);
        callback(null, {
          eventId: String(event.eventId || `event-${auditEvents.length}`),
          persistedAt: new Date().toISOString(),
        });
      },
      appendEventBatch(call, callback) {
        const events = Array.isArray(call.request?.events) ? call.request.events : [];
        for (const event of events) {
          auditEvents.push(event);
        }
        callback(null, {
          persistedCount: events.length,
          eventIds: events.map((event, index) => String(event?.eventId || `batch-${index}`)),
          persistedAt: new Date().toISOString(),
        });
      },
      queryEvents(_call, callback) {
        callback(null, { events: auditEvents, totalCount: auditEvents.length, nextCursor: "" });
      },
      queryEventsStream(call) {
        for (const event of auditEvents) {
          call.write({ event });
        }
        call.end();
      },
    });
    await startServer(auditServer, ports.auditWriter, "audit-writer-e2e");
    startedServers.push(auditServer);

    const secretsProto = loadProto("maple/secrets/v1/secrets_broker.proto").maple.secrets.v1;
    const secretsServer = new grpc.Server();
    secretsServer.addService(secretsProto.SecretsBrokerService.service, {
      mintCredential(call, callback) {
        mintCredentialCalls += 1;
        const now = Date.now();
        const ttlSeconds = Number(call.request?.ttlSeconds || 60);
        callback(null, {
          credential: {
            credentialId: `cred-${now}`,
            toolName: String(call.request?.toolName || ""),
            appId: String(call.request?.appId || ""),
            scopes: Array.isArray(call.request?.scopes) ? call.request.scopes : [],
            issuedAt: new Date(now).toISOString(),
            expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
            status: "CREDENTIAL_STATUS_ACTIVE",
            issuedBy: "test-suite",
          },
          token: "test-token",
        });
      },
      revokeCredential(call, callback) {
        callback(null, { revoked: true, credentialId: String(call.request?.credentialId || "") });
      },
      getCredentialStatus(call, callback) {
        callback(null, {
          credential: {
            credentialId: String(call.request?.credentialId || ""),
            status: "CREDENTIAL_STATUS_ACTIVE",
          },
        });
      },
      listActiveCredentials(_call, callback) {
        callback(null, { credentials: [] });
      },
    });
    await startServer(secretsServer, ports.secretsBroker, "secrets-broker-e2e");
    startedServers.push(secretsServer);

    const modelProto = loadProto("maple/model/v1/model_router.proto").maple.model.v1;
    const modelRouterServer = new grpc.Server();
    modelRouterServer.addService(modelProto.ModelRouterService.service, {
      generate(call, callback) {
        modelGenerateCalls += 1;
        const messages = Array.isArray(call.request?.messages) ? call.request.messages : [];
        const hasToolResult = messages.some((message) => String(message?.role || "") === "CHAT_ROLE_TOOL");

        if (!hasToolResult) {
          callback(null, {
            message: { role: "CHAT_ROLE_ASSISTANT", content: "calling tool" },
            toolCalls: [
              {
                id: "tool-call-1",
                name: "web_search",
                argumentsJson: Buffer.from(JSON.stringify({ query: "maple" })),
              },
            ],
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            model: "stub-model",
            finishReason: "tool_calls",
          });
          return;
        }

        callback(null, {
          message: { role: "CHAT_ROLE_ASSISTANT", content: "tool-flow-final" },
          toolCalls: [],
          usage: { promptTokens: 2, completionTokens: 2, totalTokens: 4 },
          model: "stub-model",
          finishReason: "stop",
        });
      },
      streamGenerate(call) {
        call.write({
          deltaContent: "tool-flow-final",
          finishReason: "stop",
        });
        call.end();
      },
    });
    await startServer(modelRouterServer, ports.modelRouter, "model-router-stub-e2e");
    startedServers.push(modelRouterServer);

    const [cyberProxyModule, toolRunnerModule, mcpProxyModule, downstreamRegistryModule, contextWallModule, approvalQueueModule] =
      await Promise.all([
        import("../../backendB-core-services/cyber-proxy/service/src/service.js"),
        import("../../backendB-core-services/tool-runner/service/src/service.js"),
        import("../../backendB-core-services/mcp-proxy/service/src/service.js"),
        import("../../backendB-core-services/mcp-proxy/service/src/downstream-registry.js"),
        import("../../backendB-core-services/context-wall/service/src/service.js"),
        import("../../backendB-core-services/context-wall/service/src/approval-queue.js"),
      ]);
    const { createCyberProxyService, closeCyberProxyClients } = cyberProxyModule;
    const { createToolRunnerService, closeToolRunnerClients } = toolRunnerModule;
    const { createMcpProxyService, closeMcpProxyClients } = mcpProxyModule;
    const { DownstreamRegistry } = downstreamRegistryModule;
    const { createContextWallService, closeContextWallClients } = contextWallModule;
    const { ApprovalQueue } = approvalQueueModule;
    if (typeof closeCyberProxyClients === "function")
      clientCleanupFns.push(closeCyberProxyClients);
    if (typeof closeToolRunnerClients === "function")
      clientCleanupFns.push(closeToolRunnerClients);
    if (typeof closeMcpProxyClients === "function")
      clientCleanupFns.push(closeMcpProxyClients);
    if (typeof closeContextWallClients === "function")
      clientCleanupFns.push(closeContextWallClients);

    let cyberServer = createCyberProxyService();
    await startServer(cyberServer, ports.cyberProxy, "cyber-proxy-e2e");
    startedServers.push(cyberServer);

    let toolRunnerServer = createToolRunnerService();
    await startServer(toolRunnerServer, ports.toolRunner, "tool-runner-e2e");
    startedServers.push(toolRunnerServer);

    const registry = new DownstreamRegistry();
    registry.loadFromEnv();
    let mcpProxyServer = createMcpProxyService(registry);
    await startServer(mcpProxyServer, ports.mcpProxy, "mcp-proxy-e2e");
    startedServers.push(mcpProxyServer);

    let contextWallServer = createContextWallService(new ApprovalQueue());
    await startServer(contextWallServer, ports.contextWall, "context-wall-e2e");
    startedServers.push(contextWallServer);

    const gatewayStateModule = await import("../../backendB-core-services/gateway-api/service/src/state.js");
    const previousDatabaseInit = gatewayStateModule.database.initialize;
    const previousTraceInit = gatewayStateModule.traceStore.init;
    const previousSharedTraceInit = gatewayStateModule.sharedTraceStore.init;
    gatewayStateModule.database.initialize = async () => undefined;
    gatewayStateModule.traceStore.init = async () => undefined;
    gatewayStateModule.sharedTraceStore.init = async () => undefined;
    restoreGatewayPersistence = async () => {
      gatewayStateModule.database.initialize = previousDatabaseInit;
      gatewayStateModule.traceStore.init = previousTraceInit;
      gatewayStateModule.sharedTraceStore.init = previousSharedTraceInit;
    };

    const { createApp } = await import("../../backendB-core-services/gateway-api/service/src/app.js");
    const gatewayRuntime = await createApp();
    const app = gatewayRuntime.app;
    shutdownGateway = typeof gatewayRuntime.shutdown === "function" ? gatewayRuntime.shutdown : async () => {};

    const response = await app.request("http://localhost/api/firewall/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Use web_search and summarize",
        tenantId: "tenant-e2e",
        userId: "user-e2e",
        deviceId: "device-e2e",
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(typeof body.reply, "string");
    assert.equal(body.reply.includes("tool-flow-final"), true);

    await waitFor(() => auditEvents.length > 0, 4000);
    await waitFor(() => {
      return auditEvents.some((event) => {
        const source = String(event?.sourceService || event?.source_service || "").toLowerCase();
        return source === "tool-runner";
      });
    }, 4000);
    assert.equal(modelGenerateCalls >= 2, true);
    assert.equal(mintCredentialCalls >= 1, true);
    const sources = new Set(
      auditEvents
        .map((event) =>
          String(event?.sourceService || event?.source_service || "").toLowerCase()
        )
        .filter(Boolean)
    );
    assert.equal(sources.size > 0, true);
    assert.equal(sources.has("context-wall"), true);
    assert.equal(sources.has("tool-runner"), true);

    const chatRequest = async () => {
      const chatResponse = await app.request("http://localhost/api/firewall/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "Use web_search and summarize",
          tenantId: "tenant-e2e",
          userId: "user-e2e",
          deviceId: "device-e2e",
        }),
      });
      const chatBody = await chatResponse.json();
      return { status: chatResponse.status, body: chatBody };
    };

    mcpProxyServer.forceShutdown();
    const mcpProxyOutage = await chatRequest();
    assert.equal(mcpProxyOutage.status, 503);
    assert.equal(mcpProxyOutage.body.ok, false);
    assert.equal(mcpProxyOutage.body.mode, "unavailable");
    mcpProxyServer = createMcpProxyService(registry);
    await startServer(mcpProxyServer, ports.mcpProxy, "mcp-proxy-e2e-restart");
    startedServers.push(mcpProxyServer);

    toolRunnerServer.forceShutdown();
    const toolRunnerOutage = await chatRequest();
    assert.equal(toolRunnerOutage.status, 503);
    assert.equal(toolRunnerOutage.body.ok, false);
    assert.equal(toolRunnerOutage.body.mode, "unavailable");
    toolRunnerServer = createToolRunnerService();
    await startServer(toolRunnerServer, ports.toolRunner, "tool-runner-e2e-restart");
    startedServers.push(toolRunnerServer);

    cyberServer.forceShutdown();
    const cyberProxyOutage = await chatRequest();
    assert.equal(cyberProxyOutage.status, 503);
    assert.equal(cyberProxyOutage.body.ok, false);
    assert.equal(cyberProxyOutage.body.mode, "unavailable");
    cyberServer = createCyberProxyService();
    await startServer(cyberServer, ports.cyberProxy, "cyber-proxy-e2e-restart");
    startedServers.push(cyberServer);

    contextWallServer.forceShutdown();
    const contextWallOutage = await chatRequest();
    assert.equal(contextWallOutage.status, 503);
    assert.equal(contextWallOutage.body.ok, false);
    assert.equal(contextWallOutage.body.mode, "unavailable");
  } finally {
    restoreLogs();
    await restoreGatewayPersistence();

    try {
      await shutdownGateway();
    } catch {
      // best effort
    }

    for (const closeClients of clientCleanupFns.reverse()) {
      try {
        closeClients();
      } catch {
        // best effort
      }
    }

    await new Promise((resolveSleep) => setTimeout(resolveSleep, 50));

    for (const server of startedServers.reverse()) {
      try {
        server.forceShutdown();
      } catch {
        // ignore
      }
    }

    if (downstreamMcpServer) {
      await new Promise((resolveClose) => {
        downstreamMcpServer.close(() => resolveClose());
      });
    }

    for (const key of envKeys) {
      if (envBackup[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = envBackup[key];
      }
    }
  }
});
