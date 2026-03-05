import test from "node:test";
import assert from "node:assert/strict";

process.env.MAPLE_LOG_LEVEL = "error";
process.env.MAPLE_LOG_INCLUDE_BODIES = "false";
process.env.MAPLE_LOG_REQUESTS = "false";
process.env.MAPLE_LOG_BODY_MAX_CHARS = "4000";
process.env.NODE_ENV = "development";

const {
  requireEnv,
  requireEnvPort,
  loadGrpcTlsConfig,
  createGrpcClientCredentials,
  createGrpcServerCredentials,
  DEFAULT_GRPC_CHANNEL_OPTIONS,
  DEFAULT_GRPC_SERVER_OPTIONS,
  createGrpcServer,
} = await import("../src/grpc.js?t=" + Date.now());

// ---------------------------------------------------------------------------
// requireEnv
// ---------------------------------------------------------------------------

test("requireEnv: returns value when env var is set", () => {
  process.env.__TEST_REQUIRE_ENV = "hello";
  assert.equal(requireEnv("__TEST_REQUIRE_ENV"), "hello");
  delete process.env.__TEST_REQUIRE_ENV;
});

test("requireEnv: throws when env var is missing", () => {
  delete process.env.__TEST_REQUIRE_ENV_MISSING;
  assert.throws(() => requireEnv("__TEST_REQUIRE_ENV_MISSING"), /Missing required/);
});

// ---------------------------------------------------------------------------
// requireEnvPort
// ---------------------------------------------------------------------------

test("requireEnvPort: valid port 8080 returns 8080", () => {
  process.env.__TEST_PORT = "8080";
  assert.equal(requireEnvPort("__TEST_PORT"), 8080);
  delete process.env.__TEST_PORT;
});

test("requireEnvPort: port 0 throws", () => {
  process.env.__TEST_PORT = "0";
  assert.throws(() => requireEnvPort("__TEST_PORT"), /Invalid port/);
  delete process.env.__TEST_PORT;
});

test("requireEnvPort: port 99999 throws", () => {
  process.env.__TEST_PORT = "99999";
  assert.throws(() => requireEnvPort("__TEST_PORT"), /Invalid port/);
  delete process.env.__TEST_PORT;
});

test("requireEnvPort: missing env var throws", () => {
  delete process.env.__TEST_PORT_MISSING;
  assert.throws(() => requireEnvPort("__TEST_PORT_MISSING"), /Missing required/);
});

// ---------------------------------------------------------------------------
// loadGrpcTlsConfig
// ---------------------------------------------------------------------------

test("loadGrpcTlsConfig: returns null when env vars not set", () => {
  delete process.env.MAPLE_GRPC_TLS_CERT;
  delete process.env.MAPLE_GRPC_TLS_KEY;
  delete process.env.MAPLE_GRPC_TLS_CA;
  assert.equal(loadGrpcTlsConfig(), null);
});

test("loadGrpcTlsConfig: returns paths when all three set", () => {
  process.env.MAPLE_GRPC_TLS_CERT = "/certs/cert.pem";
  process.env.MAPLE_GRPC_TLS_KEY = "/certs/key.pem";
  process.env.MAPLE_GRPC_TLS_CA = "/certs/ca.pem";
  const config = loadGrpcTlsConfig();
  assert.deepEqual(config, {
    certPath: "/certs/cert.pem",
    keyPath: "/certs/key.pem",
    caPath: "/certs/ca.pem",
  });
  delete process.env.MAPLE_GRPC_TLS_CERT;
  delete process.env.MAPLE_GRPC_TLS_KEY;
  delete process.env.MAPLE_GRPC_TLS_CA;
});

// ---------------------------------------------------------------------------
// createGrpcClientCredentials
// ---------------------------------------------------------------------------

test("createGrpcClientCredentials: insecure when null and not production", () => {
  process.env.NODE_ENV = "development";
  const creds = createGrpcClientCredentials(null);
  // grpc.credentials.createInsecure() returns a ChannelCredentials instance
  assert.ok(creds !== null && creds !== undefined);
});

// ---------------------------------------------------------------------------
// createGrpcServerCredentials
// ---------------------------------------------------------------------------

test("createGrpcServerCredentials: insecure when null and not production", () => {
  process.env.NODE_ENV = "development";
  const creds = createGrpcServerCredentials(null);
  assert.ok(creds !== null && creds !== undefined);
});

// ---------------------------------------------------------------------------
// DEFAULT_GRPC_CHANNEL_OPTIONS
// ---------------------------------------------------------------------------

test("DEFAULT_GRPC_CHANNEL_OPTIONS: has expected keys", () => {
  assert.equal(DEFAULT_GRPC_CHANNEL_OPTIONS["grpc.keepalive_time_ms"], 30000);
  assert.equal(DEFAULT_GRPC_CHANNEL_OPTIONS["grpc.keepalive_timeout_ms"], 10000);
  assert.equal(DEFAULT_GRPC_CHANNEL_OPTIONS["grpc.keepalive_permit_without_calls"], 1);
  assert.equal(DEFAULT_GRPC_CHANNEL_OPTIONS["grpc.max_send_message_length"], 10 * 1024 * 1024);
  assert.equal(DEFAULT_GRPC_CHANNEL_OPTIONS["grpc.max_receive_message_length"], 10 * 1024 * 1024);
  assert.equal(DEFAULT_GRPC_CHANNEL_OPTIONS["grpc.max_concurrent_streams"], 100);
  assert.equal(DEFAULT_GRPC_CHANNEL_OPTIONS["grpc.default_compression_algorithm"], 2);
  assert.equal(DEFAULT_GRPC_CHANNEL_OPTIONS["grpc.enable_retries"], 1);
  const serviceConfig = JSON.parse(DEFAULT_GRPC_CHANNEL_OPTIONS["grpc.service_config"]);
  assert.deepEqual(serviceConfig.loadBalancingConfig, [{ round_robin: {} }]);
});

// ---------------------------------------------------------------------------
// DEFAULT_GRPC_SERVER_OPTIONS
// ---------------------------------------------------------------------------

test("DEFAULT_GRPC_SERVER_OPTIONS: has expected keys", () => {
  assert.equal(DEFAULT_GRPC_SERVER_OPTIONS["grpc.keepalive_time_ms"], 30000);
  assert.equal(DEFAULT_GRPC_SERVER_OPTIONS["grpc.keepalive_timeout_ms"], 10000);
  assert.equal(DEFAULT_GRPC_SERVER_OPTIONS["grpc.keepalive_permit_without_calls"], 1);
  assert.equal(DEFAULT_GRPC_SERVER_OPTIONS["grpc.max_send_message_length"], 10 * 1024 * 1024);
  assert.equal(DEFAULT_GRPC_SERVER_OPTIONS["grpc.max_receive_message_length"], 10 * 1024 * 1024);
  assert.equal(DEFAULT_GRPC_SERVER_OPTIONS["grpc.max_concurrent_streams"], 100);
});

// ---------------------------------------------------------------------------
// createGrpcServer
// ---------------------------------------------------------------------------

test("createGrpcServer: returns a gRPC Server instance", () => {
  const server = createGrpcServer();
  assert.ok(server);
  assert.equal(typeof server.addService, "function");
  assert.equal(typeof server.bindAsync, "function");
  assert.equal(typeof server.tryShutdown, "function");
  server.forceShutdown();
});

test("createGrpcServer: accepts custom options", () => {
  const server = createGrpcServer({ "grpc.max_concurrent_streams": 200 });
  assert.ok(server);
  server.forceShutdown();
});
