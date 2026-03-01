import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

function runDependencyReport({ modulePath, exportName, env = {} }) {
  const moduleUrl = pathToFileURL(resolve(modulePath)).href;
  const snippet = `
    const mod = await import(${JSON.stringify(moduleUrl)});
    const report = await mod[${JSON.stringify(exportName)}]({ force: true });
    process.stdout.write(JSON.stringify(report));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", snippet], {
    cwd: resolve("."),
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const stderr = String(result.stderr || "").trim();
    const stdout = String(result.stdout || "").trim();
    throw new Error(
      `Dependency report script failed (${modulePath}): ${stderr || stdout || "unknown error"}`
    );
  }
  const output = String(result.stdout || "").trim();
  if (!output) {
    throw new Error(`Dependency report script returned empty output for ${modulePath}.`);
  }
  return JSON.parse(output);
}

function hasFailure(report, dependencyId) {
  return report.requiredFailures.some((failure) => failure.id === dependencyId);
}

const gatewayBaseEnv = {
  NODE_ENV: "production",
  MAPLE_RUNTIME_STRICT_DEPENDENCIES: "0",
  DATABASE_URL: "postgresql://maple:maple@127.0.0.1:5432/maple_test",
  MAPLE_DEP_REQUIRE_CONTEXT_WALL: "0",
  MAPLE_DEP_REQUIRE_MCP_PROXY: "0",
  MAPLE_DEP_REQUIRE_TOOL_RUNNER: "0",
  MAPLE_DEP_REQUIRE_CYBER_PROXY: "0",
  MAPLE_DEP_REQUIRE_BUSINESS_API: "0",
  MAPLE_DEP_REQUIRE_STRIPE: "0",
  MAPLE_DEP_REQUIRE_GOOGLE_AUTH: "0",
  MAPLE_DEP_REQUIRE_MODEL_ROUTER: "0",
  // ── gateway-api config requirements ──
  MAPLE_LOG_LEVEL: "error",
  MAPLE_LOG_REQUESTS: "0",
  MAPLE_LOG_INCLUDE_BODIES: "0",
  MAPLE_LOG_BODY_MAX_CHARS: "4000",
  MAPLE_FIREWALL_LOG_DIR: "/tmp/maple-firewall-logs",
  GATEWAY_PORT: "8443",
  GATEWAY_HOST: "0.0.0.0",
  MAPLE_GATEWAY_TLS_CERT: "/tmp/maple-test-tls/tls.crt",
  MAPLE_GATEWAY_TLS_KEY: "/tmp/maple-test-tls/tls.key",
  MAPLE_GATEWAY_TLS_CA: "/tmp/maple-test-tls/ca.crt",
  MAPLE_GRPC_TLS_CERT: "/tmp/maple-test-tls/tls.crt",
  MAPLE_GRPC_TLS_KEY: "/tmp/maple-test-tls/tls.key",
  MAPLE_GRPC_TLS_CA: "/tmp/maple-test-tls/ca.crt",
  CONTEXT_WALL_ADDRESS: "localhost:9000",
  MODEL_ROUTER_ADDRESS: "localhost:9100",
  MCP_PROXY_ADDRESS: "localhost:9200",
  TOOL_RUNNER_ADDRESS: "localhost:9250",
  CYBER_PROXY_ADDRESS: "localhost:8080",
  SECRETS_BROKER_ADDRESS: "localhost:9300",
  AUDIT_WRITER_ADDRESS: "localhost:9400",
  MAPLE_ALLOW_NO_AUTH: "0",
  MAPLE_ALLOW_BRIDGE_OVERRIDE: "0",
  MAPLE_LOCK_BRIDGE_TARGET: "0",
  OPENCLAW_BRIDGE_URL: "http://127.0.0.1:8787",
  OPENCLAW_BRIDGE_TOKEN: "test-token",
  MAPLE_OPENCLAW_AGENT_ENABLED: "0",
  MAPLE_OPENCLAW_AGENT_MODE: "gateway",
  MAPLE_OPENCLAW_AGENT_REQUIRED: "0",
  MAPLE_OPENCLAW_AGENT_DEV_PROFILE: "0",
  MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY: "0",
  MAPLE_OPENCLAW_AGENT_GATEWAY_PORT: "19001",
  MAPLE_OPENCLAW_AGENT_GATEWAY_BIND: "loopback",
  MAPLE_OPENCLAW_AGENT_DEFAULT_SESSION_ID: "agent-dev-main",
  MAPLE_OPENCLAW_AGENT_DEFAULT_THINKING: "medium",
  MAPLE_OPENCLAW_AGENT_TIMEOUT_SECONDS: "120",
  MAPLE_OPENCLAW_MODIFIER_ENABLED: "1",
  MAPLE_OPENCLAW_MODIFIER_ALLOW_DEV_PROFILE: "0",
  MAPLE_OPENCLAW_MODIFIER_APPROVAL_TTL_SECONDS: "900",
  MAPLE_OPENCLAW_MODIFIER_MAX_TIMEOUT_SECONDS: "90",
  MAPLE_OPENCLAW_MODIFIER_MAX_BUFFER_MB: "8",
  MAPLE_OPENCLAW_MODIFIER_SOURCE_PROFILE: "default",
  MAPLE_OPENCLAW_MODIFIER_ALLOWED_TOOLS: "agent,agents,message,sessions,status,health,gateway,memory,models,skills,nodes,logs",
  MAPLE_OPENCLAW_MODIFIER_DANGEROUS_TOOLS: "setup,onboard,configure,config,reset,uninstall,update,plugins,webhooks,hooks,pairing,devices,node,sandbox,daemon,voicecall,acp,system,directory,dns,browser,cron",
  MAPLE_OPENCLAW_MODIFIER_BLOCKED_TARGET_PROFILES: "default,main,primary,root,system",
  MAPLE_OPENCLAW_MODIFIER_REQUIRE_SCOPE: "1",
  MAPLE_OPENCLAW_MODIFIER_REQUIRE_ORG_RBAC: "1",
  MAPLE_OPENCLAW_MODIFIER_REQUIRE_TENANT_POLICY: "0",
  MAPLE_OPENCLAW_MODIFIER_AUTO_BOOTSTRAP_OWNER: "1",
  MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX: "1",
  MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_INTERVAL_MS: "5000",
  MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_BATCH_SIZE: "50",
  MAPLE_OPENCLAW_MODIFIER_AUDIT_OUTBOX_MAX_RETRIES: "5",
  MAPLE_STEP_UP_REQUIRED_FOR_APPROVALS: "0",
  MAPLE_ESCALATION_CHECK_INTERVAL_MS: "30000",
  MAPLE_RETENTION_CHECK_INTERVAL_MS: "86400000",
  MAPLE_MODIFIER_GOVERNANCE_ENABLED: "0",
  MAPLE_LEADER_ELECTION_ENABLED: "0",
  MAPLE_OTLP_ENDPOINT: "http://localhost:4318",
  MAPLE_OTLP_SERVICE_NAME: "gateway-api",
  MAPLE_OTLP_BATCH_SIZE: "100",
  MAPLE_OTLP_FLUSH_INTERVAL_MS: "5000",
  MAPLE_OTLP_TIMEOUT_MS: "5000",
  MAPLE_EVENT_TRANSPORT_BACKEND: "pg",
  MAPLE_REDIS_URL: "redis://localhost:6379",
  MAPLE_FIREWALL_CHAT_PREFER_OPENCLAW: "1",
  MAPLE_FIREWALL_CHAT_STRICT_MODE: "0",
  MAPLE_FIREWALL_CHAT_PRIMARY: "openai",
  MAPLE_FIREWALL_CHAT_OPENAI_MODEL: "gpt-4o-mini",
  MAPLE_FIREWALL_CHAT_ANTHROPIC_MODEL: "claude-sonnet-4-6",
  MAPLE_FIREWALL_CHAT_TIMEOUT_MS: "15000",
  OPENAI_API_KEY: "test-openai-key",
  ANTHROPIC_API_KEY: "test-anthropic-key",
  MAPLE_SESSION_POLL: "0",
  MAPLE_SESSION_POLL_MS: "5000",
  MAPLE_MCP_FIREWALL_DEFAULT_APP: "default",
  MAPLE_MCP_PROXY_ALLOW_DYNAMIC_TARGETS: "0",
  MAPLE_MCP_PROXY_ALLOW_HTTP: "0",
  MAPLE_MCP_PROXY_ALLOW_PRIVATE_TARGETS: "0",
  MAPLE_MCP_PROXY_DEFAULT_TARGET_URL: "http://localhost:3000",
  MAPLE_MCP_PROXY_ALLOWED_HOSTS: "localhost",
  MAPLE_MCP_EXECUTION_ORDER: "default",
  MAPLE_DOWNSTREAM_TOOLS_CACHE_TTL_MS: "15000",
  MAPLE_MCP_ROUTE_LOCK: "0",
  MAPLE_SESSION_OWNER_SCOPE: "auto",
  MAPLE_ENABLE_DEMO_ROUTES: "0",
  MAPLE_ENABLE_JUDGE_UI: "0",
  MAPLE_SESSION_COOKIE_NAME: "maple_session",
  MAPLE_SESSION_TTL_SECONDS: "604800",
  MAPLE_AUTH_ALLOW_SELF_SIGNUP: "0",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  MAPLE_GPT_OAUTH_CLIENT_ID: "maple-gpt-client",
  MAPLE_GPT_OAUTH_CLIENT_SECRET: "maple-secret",
  MAPLE_TENANT_CLAIM_SIGNING_KEY: "ci-test-tenant-key",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_PRO: "price_pro",
  STRIPE_PRICE_TEAM: "price_team",
  STRIPE_PRICE_ENTERPRISE: "price_enterprise",
  STRIPE_PUBLISHABLE_KEY: "pk_test_placeholder",
  MAPLE_BUSINESS_API_BASE_URL: "http://localhost:9550",
  MAPLE_BUSINESS_API_REQUIRED: "0",
  MAPLE_BUSINESS_API_CA: "/tmp/maple-test-tls/ca.crt",
  MAPLE_BUSINESS_API_CERT: "/tmp/maple-test-tls/tls.crt",
  MAPLE_BUSINESS_API_KEY: "/tmp/maple-test-tls/tls.key",
  MAPLE_BUSINESS_API_TIMEOUT_MS: "3000",
  CORS_ORIGIN: "*",
  MCP_URL: "http://localhost:3000",
  DOWNSTREAM_APPS: "none",
};

const businessBaseEnv = {
  NODE_ENV: "production",
  MAPLE_RUNTIME_STRICT_DEPENDENCIES: "0",
  DATABASE_URL: "postgresql://maple:maple@127.0.0.1:5432/maple_test",
  // ── business-api config requirements ──
  MAPLE_LOG_LEVEL: "error",
  MAPLE_LOG_REQUESTS: "0",
  MAPLE_LOG_INCLUDE_BODIES: "0",
  MAPLE_LOG_BODY_MAX_CHARS: "4000",
  BUSINESS_API_HOST: "0.0.0.0",
  BUSINESS_API_PORT: "9550",
  MAPLE_BUSINESS_API_TLS_CERT: "/tmp/maple-test-tls/tls.crt",
  MAPLE_BUSINESS_API_TLS_KEY: "/tmp/maple-test-tls/tls.key",
  MAPLE_BUSINESS_API_TLS_CA: "/tmp/maple-test-tls/ca.crt",
  MAPLE_BUSINESS_API_MTLS_REQUIRED: "1",
  MAPLE_BUSINESS_API_SKIP_DB_INIT: "0",
  MAPLE_ALLOW_NO_AUTH: "0",
  MAPLE_SESSION_COOKIE_NAME: "maple_session",
  MAPLE_SESSION_TTL_SECONDS: "604800",
  MAPLE_AUTH_ALLOW_SELF_SIGNUP: "0",
  MAPLE_SESSION_OWNER_SCOPE: "auto",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_PRO: "price_pro",
  STRIPE_PRICE_TEAM: "price_team",
  STRIPE_PRICE_ENTERPRISE: "price_enterprise",
  AUDIT_WRITER_ADDRESS: "localhost:9400",
  MAPLE_RECOVERY_DELIVERY_REQUIRED: "0",
  MAPLE_RECOVERY_EMAIL_PROVIDER: "none",
  MAPLE_RECOVERY_EMAIL_FROM: "noreply@test.com",
  MAPLE_RECOVERY_EMAIL_REPLY_TO: "support@test.com",
  MAPLE_RECOVERY_EMAIL_SUBJECT_PREFIX: "[Maple]",
  MAPLE_RECOVERY_RESET_BASE_URL: "http://localhost:3000/reset",
  MAPLE_RECOVERY_VERIFY_BASE_URL: "http://localhost:3000/verify",
  SENDGRID_API_KEY: "test-sendgrid-key",
  RESEND_API_KEY: "test-resend-key",
  MAPLE_RECOVERY_SMS_PROVIDER: "none",
  MAPLE_RECOVERY_SMS_TO: "+1234567890",
  MAPLE_RECOVERY_SMS_FROM: "+0987654321",
  TWILIO_ACCOUNT_SID: "test-twilio-sid",
  TWILIO_AUTH_TOKEN: "test-twilio-token",
  MAPLE_DISABLE_AUDIT_EMIT: "1",
};

test("gateway dependency matrix fails closed when OpenClaw is required and runtime is unavailable", () => {
  const report = runDependencyReport({
    modulePath: "backend/backendB-core-services/gateway-api/service/src/core/runtime-dependencies.js",
    exportName: "evaluateGatewayRuntimeDependencies",
    env: {
      ...gatewayBaseEnv,
      MAPLE_DEP_REQUIRE_OPENCLAW: "1",
    },
  });

  assert.equal(report.ready, false);
  assert.equal(hasFailure(report, "openclaw.runtime"), true);
});

test("gateway dependency matrix does not block readiness when OpenClaw is optional", () => {
  const report = runDependencyReport({
    modulePath: "backend/backendB-core-services/gateway-api/service/src/core/runtime-dependencies.js",
    exportName: "evaluateGatewayRuntimeDependencies",
    env: {
      ...gatewayBaseEnv,
      MAPLE_DEP_REQUIRE_OPENCLAW: "0",
    },
  });

  assert.equal(report.ready, true);
  assert.equal(hasFailure(report, "openclaw.runtime"), false);
});

test("business dependency matrix fails closed when Stripe keys are empty (config.js rejects at load time)", () => {
  // With requireEnv(), empty Stripe keys cause config.js to throw at load time.
  // This IS the fail-closed behavior — the process cannot start without valid config.
  assert.throws(
    () =>
      runDependencyReport({
        modulePath: "backend/backendC-saas-services/business-api/service/src/runtime-dependencies.js",
        exportName: "evaluateBusinessRuntimeDependencies",
        env: {
          ...businessBaseEnv,
          MAPLE_DEP_REQUIRE_STRIPE: "1",
          STRIPE_SECRET_KEY: "",
          STRIPE_WEBHOOK_SECRET: "",
          STRIPE_PRICE_PRO: "",
          STRIPE_PRICE_TEAM: "",
          STRIPE_PRICE_ENTERPRISE: "",
        },
      }),
    /Missing required environment variable: STRIPE_SECRET_KEY|Dependency report script failed/
  );
});

test("business dependency matrix passes when Stripe requirement is met", () => {
  const report = runDependencyReport({
    modulePath: "backend/backendC-saas-services/business-api/service/src/runtime-dependencies.js",
    exportName: "evaluateBusinessRuntimeDependencies",
    env: {
      ...businessBaseEnv,
      MAPLE_DEP_REQUIRE_STRIPE: "1",
      MAPLE_DEP_REQUIRE_GOOGLE_AUTH: "0",
      STRIPE_SECRET_KEY: "sk_test_maple",
      STRIPE_WEBHOOK_SECRET: "whsec_maple",
      STRIPE_PRICE_PRO: "price_pro",
      STRIPE_PRICE_TEAM: "price_team",
      STRIPE_PRICE_ENTERPRISE: "price_enterprise",
    },
  });

  assert.equal(report.ready, true);
  assert.equal(hasFailure(report, "config.stripe"), false);
});

test("business dependency matrix fails closed when Google client id is empty (config.js rejects at load time)", () => {
  // With requireEnv(), empty GOOGLE_CLIENT_ID causes config.js to throw at load time.
  assert.throws(
    () =>
      runDependencyReport({
        modulePath: "backend/backendC-saas-services/business-api/service/src/runtime-dependencies.js",
        exportName: "evaluateBusinessRuntimeDependencies",
        env: {
          ...businessBaseEnv,
          MAPLE_DEP_REQUIRE_GOOGLE_AUTH: "1",
          MAPLE_DEP_REQUIRE_STRIPE: "0",
          GOOGLE_CLIENT_ID: "",
        },
      }),
    /Missing required environment variable: GOOGLE_CLIENT_ID|Dependency report script failed/
  );
});

test("business dependency matrix passes when Google auth requirement is met", () => {
  const report = runDependencyReport({
    modulePath: "backend/backendC-saas-services/business-api/service/src/runtime-dependencies.js",
    exportName: "evaluateBusinessRuntimeDependencies",
    env: {
      ...businessBaseEnv,
      MAPLE_DEP_REQUIRE_GOOGLE_AUTH: "1",
      MAPLE_DEP_REQUIRE_STRIPE: "0",
      GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
    },
  });

  assert.equal(report.ready, true);
  assert.equal(hasFailure(report, "config.google_client_id"), false);
});

test("business dependency matrix fails closed when recovery delivery is required and provider is missing", () => {
  const report = runDependencyReport({
    modulePath: "backend/backendC-saas-services/business-api/service/src/runtime-dependencies.js",
    exportName: "evaluateBusinessRuntimeDependencies",
    env: {
      ...businessBaseEnv,
      MAPLE_DEP_REQUIRE_RECOVERY_DELIVERY: "1",
      MAPLE_DEP_REQUIRE_GOOGLE_AUTH: "0",
      MAPLE_DEP_REQUIRE_STRIPE: "0",
      MAPLE_RECOVERY_EMAIL_PROVIDER: "none",
      MAPLE_RECOVERY_SMS_PROVIDER: "none",
    },
  });

  assert.equal(report.ready, false);
  assert.equal(hasFailure(report, "config.recovery_delivery"), true);
});

test("business dependency matrix passes when recovery delivery requirement is met", () => {
  const report = runDependencyReport({
    modulePath: "backend/backendC-saas-services/business-api/service/src/runtime-dependencies.js",
    exportName: "evaluateBusinessRuntimeDependencies",
    env: {
      ...businessBaseEnv,
      MAPLE_DEP_REQUIRE_RECOVERY_DELIVERY: "1",
      MAPLE_DEP_REQUIRE_GOOGLE_AUTH: "0",
      MAPLE_DEP_REQUIRE_STRIPE: "0",
      MAPLE_RECOVERY_EMAIL_PROVIDER: "sendgrid",
      MAPLE_RECOVERY_EMAIL_FROM: "no-reply@maple.test",
      SENDGRID_API_KEY: "sg_test_key",
    },
  });

  assert.equal(report.ready, true);
  assert.equal(hasFailure(report, "config.recovery_delivery"), false);
});
