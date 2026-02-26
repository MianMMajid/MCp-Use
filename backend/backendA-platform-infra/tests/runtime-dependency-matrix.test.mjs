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
};

const businessBaseEnv = {
  NODE_ENV: "production",
  MAPLE_RUNTIME_STRICT_DEPENDENCIES: "0",
  DATABASE_URL: "postgresql://maple:maple@127.0.0.1:5432/maple_test",
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

test("business dependency matrix fails closed when Stripe is required and keys are missing", () => {
  const report = runDependencyReport({
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
  });

  assert.equal(report.ready, false);
  assert.equal(hasFailure(report, "config.stripe"), true);
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

test("business dependency matrix fails closed when Google auth is required and client id is missing", () => {
  const report = runDependencyReport({
    modulePath: "backend/backendC-saas-services/business-api/service/src/runtime-dependencies.js",
    exportName: "evaluateBusinessRuntimeDependencies",
    env: {
      ...businessBaseEnv,
      MAPLE_DEP_REQUIRE_GOOGLE_AUTH: "1",
      MAPLE_DEP_REQUIRE_STRIPE: "0",
      GOOGLE_CLIENT_ID: "",
    },
  });

  assert.equal(report.ready, false);
  assert.equal(hasFailure(report, "config.google_client_id"), true);
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
