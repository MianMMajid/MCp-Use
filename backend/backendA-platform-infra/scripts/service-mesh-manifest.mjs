export const SERVICE_MESH_TARGETS = [
  {
    name: "admin-console-api",
    servicePath: "backend/backendB-core-services/admin-console-api/service",
  },
  {
    name: "audit-writer",
    servicePath: "backend/backendB-core-services/audit-writer/service",
  },
  {
    name: "context-wall",
    servicePath: "backend/backendB-core-services/context-wall/service",
  },
  {
    name: "cyber-proxy",
    servicePath: "backend/backendB-core-services/cyber-proxy/service",
  },
  {
    name: "gateway-api",
    servicePath: "backend/backendB-core-services/gateway-api/service",
  },
  {
    name: "mcp-proxy",
    servicePath: "backend/backendB-core-services/mcp-proxy/service",
  },
  {
    name: "model-router",
    servicePath: "backend/backendB-core-services/model-router/service",
  },
  {
    name: "secrets-broker",
    servicePath: "backend/backendB-core-services/secrets-broker/service",
  },
  {
    name: "tool-runner",
    servicePath: "backend/backendB-core-services/tool-runner/service",
  },
  {
    name: "business-api",
    servicePath: "backend/backendC-saas-services/business-api/service",
  },
];

export const SERVICE_MESH_SERVICES = SERVICE_MESH_TARGETS.map((target) => target.name);

// Legacy export retained for compatibility with older scripts.
export const SERVICE_ROOT = "backend/backendB-core-services";

export function findServiceTarget(name) {
  return SERVICE_MESH_TARGETS.find((target) => target.name === name);
}
