// Env setup before imports — required by @maple/common and config.js
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";
process.env.MCP_PROXY_PORT = process.env.MCP_PROXY_PORT || "9200";
process.env.MCP_PROXY_HOST = process.env.MCP_PROXY_HOST || "0.0.0.0";
process.env.AUDIT_WRITER_ADDRESS = process.env.AUDIT_WRITER_ADDRESS || "localhost:9400";
process.env.CONTEXT_WALL_ADDRESS = process.env.CONTEXT_WALL_ADDRESS || "localhost:9000";
process.env.CYBER_PROXY_ADDRESS = process.env.CYBER_PROXY_ADDRESS || "localhost:8080";
process.env.DOWNSTREAM_APPS = process.env.DOWNSTREAM_APPS || "none";
process.env.MAPLE_DOWNSTREAM_APPS = process.env.MAPLE_DOWNSTREAM_APPS || "none";
process.env.MAPLE_TOOL_RUNNER_MODE = process.env.MAPLE_TOOL_RUNNER_MODE || "service";
process.env.MAPLE_TOOL_RUNNER_IMAGE = process.env.MAPLE_TOOL_RUNNER_IMAGE || "tool-runner:latest";
process.env.MAPLE_TOOL_RUNNER_JOB_NAMESPACE = process.env.MAPLE_TOOL_RUNNER_JOB_NAMESPACE || "maple-tools";
// K8s env vars required by K8sJobDispatcher constructor
process.env.KUBERNETES_SERVICE_HOST = "10.0.0.1";
process.env.KUBERNETES_SERVICE_PORT = "443";
process.env.NODE_ENV = "development";

import assert from "node:assert/strict";
import test from "node:test";

const { K8sJobDispatcher } = await import(`../src/k8s-job-dispatcher.js?t=${Date.now()}`);

// ── Tests ────────────────────────────────────────────────────────────────────

test("K8sJobDispatcher: buildJobSpec returns valid K8s Job manifest", () => {
  const dispatcher = new K8sJobDispatcher();
  const spec = dispatcher.buildJobSpec("test-job-123", "test-config-123");

  assert.equal(spec.apiVersion, "batch/v1");
  assert.equal(spec.kind, "Job");
  assert.equal(spec.metadata.name, "test-job-123");
  assert.equal(spec.metadata.namespace, "maple-tools");

  // Verify pod security context
  assert.equal(spec.spec.template.spec.securityContext.runAsNonRoot, true);
  assert.equal(spec.spec.template.spec.securityContext.runAsUser, 1000);
  assert.equal(spec.spec.template.spec.securityContext.runAsGroup, 1000);
  assert.equal(spec.spec.template.spec.securityContext.fsGroup, 1000);

  // Verify container settings
  const container = spec.spec.template.spec.containers[0];
  assert.equal(container.name, "mcp-proxy-tool");
  assert.equal(container.securityContext.readOnlyRootFilesystem, true);
  assert.equal(container.securityContext.allowPrivilegeEscalation, false);
  assert.deepEqual(container.securityContext.capabilities.drop, ["ALL"]);

  // Verify volume mounts
  assert.ok(spec.spec.template.spec.volumes.find(v => v.name === "job-input"));
  assert.ok(spec.spec.template.spec.volumes.find(v => v.name === "job-output"));
  assert.ok(spec.spec.template.spec.volumes.find(v => v.name === "grpc-tls"));
});

test("K8sJobDispatcher: job spec has TTL, deadline, and backoffLimit", () => {
  const dispatcher = new K8sJobDispatcher();
  const spec = dispatcher.buildJobSpec("ttl-job", "ttl-config");

  assert.equal(spec.spec.ttlSecondsAfterFinished, 300);
  assert.equal(spec.spec.activeDeadlineSeconds, 120);
  assert.equal(spec.spec.backoffLimit, 0);
});

test("K8sJobDispatcher: job spec uses configured image", () => {
  const dispatcher = new K8sJobDispatcher();
  const spec = dispatcher.buildJobSpec("img-job", "img-config");

  const container = spec.spec.template.spec.containers[0];
  assert.equal(container.image, "tool-runner:latest");
});

test("K8sJobDispatcher: job spec labels include job ID", () => {
  const dispatcher = new K8sJobDispatcher();
  const spec = dispatcher.buildJobSpec("labeled-job", "labeled-config");

  assert.equal(spec.metadata.labels["maple-job-id"], "labeled-job");
  assert.equal(spec.metadata.labels["app.kubernetes.io/managed-by"], "mcp-proxy");
  assert.equal(spec.spec.template.metadata.labels["maple-job-id"], "labeled-job");
  assert.equal(spec.spec.template.metadata.labels.app, "mcp-proxy-job");
});

test("K8sJobDispatcher: job spec configMap volume references input name", () => {
  const dispatcher = new K8sJobDispatcher();
  const spec = dispatcher.buildJobSpec("cm-job", "my-configmap");

  const inputVolume = spec.spec.template.spec.volumes.find(v => v.name === "job-input");
  assert.ok(inputVolume);
  assert.equal(inputVolume.configMap.name, "my-configmap");
});

test("K8sJobDispatcher: container has resource requests and limits", () => {
  const dispatcher = new K8sJobDispatcher();
  const spec = dispatcher.buildJobSpec("res-job", "res-config");

  const container = spec.spec.template.spec.containers[0];
  assert.equal(container.resources.requests.memory, "64Mi");
  assert.equal(container.resources.requests.cpu, "50m");
  assert.equal(container.resources.limits.memory, "256Mi");
  assert.equal(container.resources.limits.cpu, "250m");
});

test("K8sJobDispatcher: container env includes CYBER_PROXY_ADDRESS", () => {
  const dispatcher = new K8sJobDispatcher();
  const spec = dispatcher.buildJobSpec("env-job", "env-config");

  const container = spec.spec.template.spec.containers[0];
  const cyberEnv = container.env.find(e => e.name === "CYBER_PROXY_ADDRESS");
  assert.ok(cyberEnv);
  assert.ok(cyberEnv.value.includes("cyber-proxy"));
});

test("K8sJobDispatcher: restartPolicy is Never", () => {
  const dispatcher = new K8sJobDispatcher();
  const spec = dispatcher.buildJobSpec("restart-job", "restart-config");

  assert.equal(spec.spec.template.spec.restartPolicy, "Never");
});
