import assert from "node:assert/strict";
import test from "node:test";

function restoreEnv(name, previousValue) {
  if (previousValue === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = previousValue;
}

test("gateway startup dependency enforcement fails closed in production", async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    enforceStartup: process.env.MAPLE_ENFORCE_STARTUP_DEPENDENCIES,
    grpcCert: process.env.MAPLE_GRPC_TLS_CERT,
    grpcKey: process.env.MAPLE_GRPC_TLS_KEY,
    grpcCa: process.env.MAPLE_GRPC_TLS_CA,
  };

  process.env.NODE_ENV = "production";
  process.env.MAPLE_ENFORCE_STARTUP_DEPENDENCIES = "1";
  process.env.MAPLE_GRPC_TLS_CERT = "/tmp/maple-missing/grpc.crt";
  process.env.MAPLE_GRPC_TLS_KEY = "/tmp/maple-missing/grpc.key";
  process.env.MAPLE_GRPC_TLS_CA = "/tmp/maple-missing/grpc-ca.crt";

  try {
    const module = await import(
      `../src/core/runtime-dependencies.js?startup-guard=${Date.now()}`
    );
    await assert.rejects(
      module.enforceGatewayStartupDependencies(),
      /Gateway startup blocked by missing required runtime dependencies\./
    );
  } finally {
    restoreEnv("NODE_ENV", previous.nodeEnv);
    restoreEnv("MAPLE_ENFORCE_STARTUP_DEPENDENCIES", previous.enforceStartup);
    restoreEnv("MAPLE_GRPC_TLS_CERT", previous.grpcCert);
    restoreEnv("MAPLE_GRPC_TLS_KEY", previous.grpcKey);
    restoreEnv("MAPLE_GRPC_TLS_CA", previous.grpcCa);
  }
});

test("gateway startup dependency enforcement can be disabled outside production", async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    enforceStartup: process.env.MAPLE_ENFORCE_STARTUP_DEPENDENCIES,
  };

  process.env.NODE_ENV = "development";
  process.env.MAPLE_ENFORCE_STARTUP_DEPENDENCIES = "0";

  try {
    const module = await import(
      `../src/core/runtime-dependencies.js?startup-non-prod=${Date.now()}`
    );
    const result = await module.enforceGatewayStartupDependencies();
    assert.equal(result.enforced, false);
    assert.equal(typeof result.report.ready, "boolean");
  } finally {
    restoreEnv("NODE_ENV", previous.nodeEnv);
    restoreEnv("MAPLE_ENFORCE_STARTUP_DEPENDENCIES", previous.enforceStartup);
  }
});
