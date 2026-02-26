#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outputPath = resolve(__dirname, "template.backend-mesh.json");

const argumentsDefaults = {
  projectName: "maple-mesh",
  projectDescription: "Maple full stack on Northflank",
  projectColor: "#0f172a",
  repoUrl: "https://github.com/your-org/your-repo",
  repoProvider: "github",
  repoBranch: "main",
  deploymentPlan: "nf-compute-20",
  buildPlan: "nf-compute-200-8",
  postgresDeploymentPlan: "nf-compute-20",
  postgresStorageMb: 10240,
  postgresReplicas: 1,
  runtimeStrictDependencies: "0",
  enforceStartupDependencies: "0",
  corsOrigin: "*",
  mapleApiKey: "",
  mapleApiKeys: "",
  mapleAdminPassword: "",
  mapleAdminApiKey: "",
  mapleAdminApiKeys: "",
  openclawBridgeToken: "",
  openclawGatewayToken: "",
  openclawGatewaySessionKey: "agent:dev:main",
  openclawAgentRequired: "0",
  googleClientId: "",
  stripeSecretKey: "",
  stripeWebhookSecret: "",
  stripePricePro: "",
  stripePriceTeam: "",
  stripePriceEnterprise: "",
  stripePublishableKey: "",
  openaiApiKey: "",
  anthropicApiKey: "",
  sendgridApiKey: "",
  resendApiKey: "",
  twilioAccountSid: "",
  twilioAuthToken: "",
  recoveryEmailProvider: "none",
  recoveryEmailFrom: "",
  recoverySmsProvider: "none",
  recoverySmsFrom: "",
  recoverySmsTo: "",
  recoveryDeliveryRequired: "0",
  tlsCertBase64: "REPLACE_WITH_BASE64_PEM_CERT",
  tlsKeyBase64: "REPLACE_WITH_BASE64_PEM_KEY",
  tlsCaBase64: "REPLACE_WITH_BASE64_PEM_CA"
};

const runtimeVariables = {
  NODE_ENV: "production",
  CORS_ORIGIN: "${args.corsOrigin}",

  MAPLE_RUNTIME_STRICT_DEPENDENCIES: "${args.runtimeStrictDependencies}",
  MAPLE_ENFORCE_STARTUP_DEPENDENCIES: "${args.enforceStartupDependencies}",

  MAPLE_ALLOW_NO_AUTH: "0",
  MAPLE_ADMIN_ALLOW_NO_AUTH: "0",
  MAPLE_BUSINESS_API_REQUIRED: "1",
  MAPLE_BUSINESS_API_MTLS_REQUIRED: "1",

  MAPLE_GRPC_TLS_CERT: "/etc/maple/tls/tls.crt",
  MAPLE_GRPC_TLS_KEY: "/etc/maple/tls/tls.key",
  MAPLE_GRPC_TLS_CA: "/etc/maple/tls/ca.crt",

  MAPLE_GATEWAY_TLS_CERT: "/etc/maple/tls/tls.crt",
  MAPLE_GATEWAY_TLS_KEY: "/etc/maple/tls/tls.key",
  MAPLE_GATEWAY_TLS_CA: "/etc/maple/tls/ca.crt",

  MAPLE_ADMIN_TLS_CERT: "/etc/maple/tls/tls.crt",
  MAPLE_ADMIN_TLS_KEY: "/etc/maple/tls/tls.key",
  MAPLE_ADMIN_TLS_CA: "/etc/maple/tls/ca.crt",

  MAPLE_BUSINESS_API_TLS_CERT: "/etc/maple/tls/tls.crt",
  MAPLE_BUSINESS_API_TLS_KEY: "/etc/maple/tls/tls.key",
  MAPLE_BUSINESS_API_TLS_CA: "/etc/maple/tls/ca.crt",

  MAPLE_BUSINESS_API_CA: "/etc/maple/tls/ca.crt",
  MAPLE_BUSINESS_API_CERT: "/etc/maple/tls/tls.crt",
  MAPLE_BUSINESS_API_KEY: "/etc/maple/tls/tls.key",

  CONTEXT_WALL_ADDRESS: "context-wall:9000",
  MODEL_ROUTER_ADDRESS: "model-router:9100",
  MCP_PROXY_ADDRESS: "mcp-proxy:9200",
  TOOL_RUNNER_ADDRESS: "tool-runner:9250",
  CYBER_PROXY_ADDRESS: "cyber-proxy:8080",
  SECRETS_BROKER_ADDRESS: "secrets-broker:9300",
  AUDIT_WRITER_ADDRESS: "audit-writer:9400",
  MAPLE_BUSINESS_API_BASE_URL: "https://business-api:9550",

  OPENCLAW_BRIDGE_MODE: "gateway",
  OPENCLAW_BRIDGE_URL: "http://openclaw-bridge:8787",
  OPENCLAW_BRIDGE_TOKEN: "${args.openclawBridgeToken}",
  OPENCLAW_GATEWAY_WS_URL: "ws://openclaw-gateway:19001",
  OPENCLAW_GATEWAY_TOKEN: "${args.openclawGatewayToken}",
  OPENCLAW_GATEWAY_SESSION_KEY: "${args.openclawGatewaySessionKey}",
  MAPLE_OPENCLAW_AGENT_MODE: "gateway",
  MAPLE_OPENCLAW_AGENT_REQUIRED: "${args.openclawAgentRequired}",
  MAPLE_OPENCLAW_AGENT_AUTOSTART_GATEWAY: "0",

  MAPLE_API_KEY: "${args.mapleApiKey}",
  MAPLE_API_KEYS: "${args.mapleApiKeys}",
  MAPLE_ADMIN_PASSWORD: "${args.mapleAdminPassword}",
  MAPLE_ADMIN_API_KEY: "${args.mapleAdminApiKey}",
  MAPLE_ADMIN_API_KEYS: "${args.mapleAdminApiKeys}",

  GOOGLE_CLIENT_ID: "${args.googleClientId}",

  STRIPE_SECRET_KEY: "${args.stripeSecretKey}",
  STRIPE_WEBHOOK_SECRET: "${args.stripeWebhookSecret}",
  STRIPE_PRICE_PRO: "${args.stripePricePro}",
  STRIPE_PRICE_TEAM: "${args.stripePriceTeam}",
  STRIPE_PRICE_ENTERPRISE: "${args.stripePriceEnterprise}",
  STRIPE_PUBLISHABLE_KEY: "${args.stripePublishableKey}",

  OPENAI_API_KEY: "${args.openaiApiKey}",
  ANTHROPIC_API_KEY: "${args.anthropicApiKey}",

  SENDGRID_API_KEY: "${args.sendgridApiKey}",
  RESEND_API_KEY: "${args.resendApiKey}",
  TWILIO_ACCOUNT_SID: "${args.twilioAccountSid}",
  TWILIO_AUTH_TOKEN: "${args.twilioAuthToken}",
  MAPLE_RECOVERY_EMAIL_PROVIDER: "${args.recoveryEmailProvider}",
  MAPLE_RECOVERY_EMAIL_FROM: "${args.recoveryEmailFrom}",
  MAPLE_RECOVERY_SMS_PROVIDER: "${args.recoverySmsProvider}",
  MAPLE_RECOVERY_SMS_FROM: "${args.recoverySmsFrom}",
  MAPLE_RECOVERY_SMS_TO: "${args.recoverySmsTo}",
  MAPLE_RECOVERY_DELIVERY_REQUIRED: "${args.recoveryDeliveryRequired}"
};

function healthTcp(portName, initialDelaySeconds = 10) {
  return {
    protocol: "TCP",
    type: "readinessProbe",
    port: portName,
    initialDelaySeconds,
    periodSeconds: 15,
    timeoutSeconds: 5,
    failureThreshold: 6
  };
}

function healthHttp(portName, path = "/health", initialDelaySeconds = 10) {
  return {
    protocol: "HTTP",
    type: "readinessProbe",
    port: portName,
    path,
    initialDelaySeconds,
    periodSeconds: 15,
    timeoutSeconds: 5,
    failureThreshold: 6
  };
}

function deploymentFromInternal({ name, command, ports, healthChecks = [], publicPortNames = [] }) {
  return {
    kind: "DeploymentService",
    spec: {
      name,
      projectId: "${refs.project.id}",
      billing: {
        deploymentPlan: "${args.deploymentPlan}"
      },
      deployment: {
        instances: 1,
        internal: {
          id: "${refs.runtimeBuild.id}",
          branch: "${args.repoBranch}",
          buildSHA: "latest"
        },
        docker: {
          configType: "customCommand",
          customCommand: command
        }
      },
      ports: ports.map((port, index) => ({
        name: `p${String(index + 1).padStart(2, "0")}`,
        internalPort: port,
        public: publicPortNames.includes(port),
        protocol: "TCP"
      })),
      healthChecks
    }
  };
}

function deploymentFromExternal({ name, imagePath, command, ports, healthChecks = [], publicPortNames = [] }) {
  return {
    kind: "DeploymentService",
    spec: {
      name,
      projectId: "${refs.project.id}",
      billing: {
        deploymentPlan: "${args.deploymentPlan}"
      },
      deployment: {
        instances: 1,
        external: {
          imagePath
        },
        docker: {
          configType: "customCommand",
          customCommand: command
        }
      },
      ports: ports.map((port, index) => ({
        name: `p${String(index + 1).padStart(2, "0")}`,
        internalPort: port,
        public: publicPortNames.includes(port),
        protocol: "TCP"
      })),
      healthChecks
    }
  };
}

function staticSurfaceCommand({ root, index }) {
  return [
    "node",
    "backend/backendA-platform-infra/scripts/static-server.mjs",
    "--root",
    root,
    "--port",
    "8080",
    "--index",
    index,
    "--proxy-target",
    "https://gateway-api:8443",
    "--proxy-prefix",
    "/api",
    "--proxy-prefix",
    "/sse",
    "--proxy-prefix",
    "/mcp",
    "--proxy-prefix",
    "/admin/api",
    "--proxy-insecure",
  ].join(" ");
}

const template = {
  apiVersion: "v1.2",
  arguments: argumentsDefaults,
  spec: {
    kind: "Workflow",
    spec: {
      type: "sequential",
      steps: [
        {
          ref: "project",
          kind: "Project",
          spec: {
            name: "${args.projectName}",
            description: "${args.projectDescription}",
            color: "${args.projectColor}"
          }
        },
        {
          ref: "postgres",
          kind: "Addon",
          spec: {
            name: "maple-postgres",
            projectId: "${refs.project.id}",
            type: "postgresql",
            version: "16",
            billing: {
              deploymentPlan: "${args.postgresDeploymentPlan}",
              storage: "${args.postgresStorageMb}",
              replicas: "${args.postgresReplicas}"
            },
            tlsEnabled: true
          }
        },
        {
          kind: "SecretGroup",
          spec: {
            name: "maple-runtime-env",
            projectId: "${refs.project.id}",
            type: "secret",
            secretType: "environment",
            priority: 50,
            secrets: {
              variables: runtimeVariables
            },
            addonDependencies: [
              {
                addonId: "${refs.postgres.id}",
                keys: [
                  {
                    keyName: "POSTGRES_URI",
                    aliases: ["DATABASE_URL", "MAPLE_DATABASE_URL"]
                  }
                ]
              }
            ]
          }
        },
        {
          kind: "SecretGroup",
          spec: {
            name: "maple-runtime-tls-files",
            projectId: "${refs.project.id}",
            type: "secret",
            secretType: "environment",
            priority: 60,
            secrets: {
              files: {
                "/etc/maple/tls/tls.crt": {
                  data: "${args.tlsCertBase64}",
                  encoding: "base64"
                },
                "/etc/maple/tls/tls.key": {
                  data: "${args.tlsKeyBase64}",
                  encoding: "base64"
                },
                "/etc/maple/tls/ca.crt": {
                  data: "${args.tlsCaBase64}",
                  encoding: "base64"
                }
              }
            }
          }
        },
        {
          ref: "runtimeBuild",
          kind: "BuildService",
          spec: {
            name: "maple-runtime-image",
            projectId: "${refs.project.id}",
            buildSource: "git",
            billing: {
              buildPlan: "${args.buildPlan}"
            },
            vcsData: {
              projectUrl: "${args.repoUrl}",
              projectType: "${args.repoProvider}",
              projectBranch: "${args.repoBranch}"
            },
            buildSettings: {
              dockerfile: {
                dockerFilePath: "/backend/backendA-platform-infra/deploy/Dockerfile",
                dockerWorkDir: "/"
              }
            }
          }
        },
        deploymentFromInternal({
          name: "gateway-api",
          command: "node backend/backendB-core-services/gateway-api/service/dist/main.js",
          ports: [8443],
          publicPortNames: [8443],
          healthChecks: [healthTcp("p01", 20)]
        }),
        deploymentFromInternal({
          name: "business-api",
          command: "node backend/backendC-saas-services/business-api/service/dist/main.js",
          ports: [9550],
          healthChecks: [healthTcp("p01", 20)]
        }),
        deploymentFromInternal({
          name: "admin-console-api",
          command: "node backend/backendB-core-services/admin-console-api/service/dist/main.js",
          ports: [9443],
          publicPortNames: [9443],
          healthChecks: [healthTcp("p01", 20)]
        }),
        deploymentFromInternal({
          name: "context-wall",
          command: "node backend/backendB-core-services/context-wall/service/dist/main.js",
          ports: [9000],
          healthChecks: [healthTcp("p01", 10)]
        }),
        deploymentFromInternal({
          name: "model-router",
          command: "node backend/backendB-core-services/model-router/service/dist/main.js",
          ports: [9100],
          healthChecks: [healthTcp("p01", 10)]
        }),
        deploymentFromInternal({
          name: "mcp-proxy",
          command: "node backend/backendB-core-services/mcp-proxy/service/dist/main.js",
          ports: [9200],
          healthChecks: [healthTcp("p01", 10)]
        }),
        deploymentFromInternal({
          name: "cyber-proxy",
          command: "node backend/backendB-core-services/cyber-proxy/service/dist/main.js",
          ports: [8080],
          healthChecks: [healthTcp("p01", 10)]
        }),
        deploymentFromInternal({
          name: "tool-runner",
          command: "node backend/backendB-core-services/tool-runner/service/dist/main.js",
          ports: [9250],
          healthChecks: [healthTcp("p01", 10)]
        }),
        deploymentFromInternal({
          name: "secrets-broker",
          command: "node backend/backendB-core-services/secrets-broker/service/dist/main.js",
          ports: [9300],
          healthChecks: [healthTcp("p01", 10)]
        }),
        deploymentFromInternal({
          name: "audit-writer",
          command: "node backend/backendB-core-services/audit-writer/service/dist/main.js",
          ports: [9400, 9401],
          healthChecks: [healthTcp("p01", 10)]
        }),
        deploymentFromExternal({
          name: "openclaw-gateway",
          imagePath: "ghcr.io/openclaw/openclaw:latest",
          command: "node openclaw.mjs --dev gateway run --port 19001 --bind lan --allow-unconfigured --verbose",
          ports: [19001],
          healthChecks: [healthTcp("p01", 10)]
        }),
        deploymentFromInternal({
          name: "openclaw-bridge",
          command: "node backend/backendA-platform-infra/scripts/openclaw-bridge-hardcoded.mjs",
          ports: [8787],
          healthChecks: [healthHttp("p01", "/health", 10)]
        }),
        deploymentFromInternal({
          name: "frontend-a-it-console",
          command: staticSurfaceCommand({
            root: "/app/frontend/frontendA-it-console/public",
            index: "judges.html",
          }),
          ports: [8080],
          publicPortNames: [8080],
          healthChecks: [healthHttp("p01", "/health", 10)]
        }),
        deploymentFromInternal({
          name: "frontend-b-desktop-app",
          command: staticSurfaceCommand({
            root: "/app/frontend/frontendB-desktop-app/app",
            index: "index.html",
          }),
          ports: [8080],
          publicPortNames: [8080],
          healthChecks: [healthHttp("p01", "/health", 10)]
        }),
        deploymentFromInternal({
          name: "frontend-c-marketing-site",
          command: staticSurfaceCommand({
            root: "/app/frontend/frontendC-marketing-download-site/public",
            index: "landing.html",
          }),
          ports: [8080],
          publicPortNames: [8080],
          healthChecks: [healthHttp("p01", "/health", 10)]
        }),
        deploymentFromInternal({
          name: "frontend-d-mcp-widgets",
          command: staticSurfaceCommand({
            root: "/app/frontend/frontendD-mcp-widgets/resources",
            index: "index.html",
          }),
          ports: [8080],
          publicPortNames: [8080],
          healthChecks: [healthHttp("p01", "/health", 10)]
        })
      ]
    }
  }
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath}`);
