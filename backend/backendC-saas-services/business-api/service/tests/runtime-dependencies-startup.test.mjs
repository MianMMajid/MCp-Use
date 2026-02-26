import assert from "node:assert/strict";
import test from "node:test";

function restoreEnv(name, previousValue) {
  if (previousValue === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = previousValue;
}

test("business startup dependency enforcement fails closed in production", async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    enforceStartup: process.env.MAPLE_ENFORCE_STARTUP_DEPENDENCIES,
    businessCert: process.env.MAPLE_BUSINESS_API_TLS_CERT,
    businessKey: process.env.MAPLE_BUSINESS_API_TLS_KEY,
    businessCa: process.env.MAPLE_BUSINESS_API_TLS_CA,
  };

  process.env.NODE_ENV = "production";
  process.env.MAPLE_ENFORCE_STARTUP_DEPENDENCIES = "1";
  process.env.MAPLE_BUSINESS_API_TLS_CERT = "/tmp/maple-missing/business.crt";
  process.env.MAPLE_BUSINESS_API_TLS_KEY = "/tmp/maple-missing/business.key";
  process.env.MAPLE_BUSINESS_API_TLS_CA = "/tmp/maple-missing/business-ca.crt";

  try {
    const module = await import(
      `../src/runtime-dependencies.js?startup-guard=${Date.now()}`
    );
    await assert.rejects(
      module.enforceBusinessStartupDependencies(),
      /Business API startup blocked by missing required runtime dependencies\./
    );
  } finally {
    restoreEnv("NODE_ENV", previous.nodeEnv);
    restoreEnv("MAPLE_ENFORCE_STARTUP_DEPENDENCIES", previous.enforceStartup);
    restoreEnv("MAPLE_BUSINESS_API_TLS_CERT", previous.businessCert);
    restoreEnv("MAPLE_BUSINESS_API_TLS_KEY", previous.businessKey);
    restoreEnv("MAPLE_BUSINESS_API_TLS_CA", previous.businessCa);
  }
});

test("business startup dependency enforcement can be disabled outside production", async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    enforceStartup: process.env.MAPLE_ENFORCE_STARTUP_DEPENDENCIES,
  };

  process.env.NODE_ENV = "development";
  process.env.MAPLE_ENFORCE_STARTUP_DEPENDENCIES = "0";

  try {
    const module = await import(
      `../src/runtime-dependencies.js?startup-non-prod=${Date.now()}`
    );
    const result = await module.enforceBusinessStartupDependencies();
    assert.equal(result.enforced, false);
    assert.equal(typeof result.report.ready, "boolean");
  } finally {
    restoreEnv("NODE_ENV", previous.nodeEnv);
    restoreEnv("MAPLE_ENFORCE_STARTUP_DEPENDENCIES", previous.enforceStartup);
  }
});
