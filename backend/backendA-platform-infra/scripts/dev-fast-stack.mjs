#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import { resolve } from "node:path";

const rootDir = process.cwd();
const stateDir = resolve(rootDir, ".maple", "dev-fast");
const logDir = resolve(stateDir, "logs");
const stateFile = resolve(stateDir, "pids.json");

mkdirSync(logDir, { recursive: true });

const managed = [];
let shuttingDown = false;

function nowIso() {
  return new Date().toISOString();
}

function sanitize(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function writeStateFile() {
  writeFileSync(
    stateFile,
    JSON.stringify(
      {
        generatedAt: nowIso(),
        rootDir,
        processes: managed.map((entry) => ({
          name: entry.name,
          pid: entry.child.pid,
          command: entry.command,
          logPath: entry.logPath,
        })),
      },
      null,
      2
    )
  );
}

function waitForPort(port, { host = "127.0.0.1", timeoutMs = 180_000 } = {}) {
  return new Promise((resolveReady, rejectReady) => {
    const startedAt = Date.now();

    const attempt = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);

      socket
        .once("connect", () => {
          socket.destroy();
          resolveReady();
        })
        .once("timeout", () => {
          socket.destroy();
          retry();
        })
        .once("error", () => {
          socket.destroy();
          retry();
        })
        .connect(port, host);
    };

    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        rejectReady(new Error(`Timed out waiting for ${host}:${port}`));
        return;
      }
      setTimeout(attempt, 250);
    };

    attempt();
  });
}

async function waitForHttp(url, { timeoutMs = 180_000, expectedStatuses = [200] } = {}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (expectedStatuses.includes(response.status)) {
        return;
      }
    } catch {}

    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function startProcess(definition) {
  const logPath = resolve(logDir, `${sanitize(definition.name)}.log`);
  const stream = createWriteStream(logPath, { flags: "a" });
  stream.write(`[${nowIso()}] starting: ${definition.command}\n`);

  const child = spawn("bash", ["-lc", definition.command], {
    cwd: rootDir,
    env: { ...process.env, ...(definition.env || {}) },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.stdout.on("data", (chunk) => {
    const text = String(chunk);
    process.stdout.write(`[${definition.name}] ${text}`);
    stream.write(text);
  });

  child.stderr.on("data", (chunk) => {
    const text = String(chunk);
    process.stderr.write(`[${definition.name}] ${text}`);
    stream.write(text);
  });

  const entry = {
    ...definition,
    child,
    logPath,
    command: definition.command,
  };

  child.on("exit", (code, signal) => {
    stream.write(`[${nowIso()}] exited code=${code ?? "null"} signal=${signal ?? "null"}\n`);
    stream.end();
    if (!shuttingDown) {
      if (definition.critical === false) {
        console.warn(`[dev-fast] Non-critical process exited: ${definition.name} (code=${code}, signal=${signal}). Auto-restarting in 3s...`);
        const restartCount = (entry._restartCount || 0) + 1;
        if (restartCount > 5) {
          console.error(`[dev-fast] ${definition.name} restarted ${restartCount} times. Giving up (other services continue).`);
          return;
        }
        setTimeout(() => {
          if (shuttingDown) return;
          console.log(`[dev-fast] Restarting ${definition.name} (attempt ${restartCount})...`);
          const restarted = launchProcess(definition);
          restarted._restartCount = restartCount;
        }, 3000);
      } else {
        console.error(`[dev-fast] Critical process exited unexpectedly: ${definition.name} (code=${code}, signal=${signal})`);
        void shutdown(1);
      }
    }
  });

  managed.push(entry);
  return entry;
}

async function waitForDefinition(definition) {
  if (definition.readyUrl) {
    await waitForHttp(definition.readyUrl, {
      timeoutMs: definition.timeoutMs ?? 240_000,
      expectedStatuses: definition.readyStatuses ?? [200],
    });
    return;
  }

  if (Number.isFinite(definition.port) && definition.port > 0) {
    await waitForPort(definition.port, {
      host: definition.host ?? "127.0.0.1",
      timeoutMs: definition.timeoutMs ?? 240_000,
    });
  }
}

async function startGroup(label, definitions) {
  if (definitions.length === 0) {
    return;
  }

  console.log(`[dev-fast] Starting ${label}...`);
  for (const definition of definitions) {
    startProcess(definition);
  }

  writeStateFile();

  for (const definition of definitions) {
    await waitForDefinition(definition);
  }
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log("[dev-fast] Shutting down all managed processes...");

  for (const entry of managed) {
    const pid = entry.child.pid;
    if (!pid || pid <= 0) {
      continue;
    }
    try {
      process.kill(-pid, "SIGTERM");
    } catch {}
  }

  await new Promise((resolveWait) => setTimeout(resolveWait, 1500));

  for (const entry of managed) {
    const pid = entry.child.pid;
    if (!pid || pid <= 0) {
      continue;
    }
    try {
      process.kill(-pid, 0);
      process.kill(-pid, "SIGKILL");
    } catch {}
  }

  process.exit(exitCode);
}

process.on("SIGINT", () => {
  void shutdown(0);
});
process.on("SIGTERM", () => {
  void shutdown(0);
});

const openClawEnabled =
  String(process.env.DEV_FAST_OPENCLAW || "").trim() === "1" ||
  String(process.env.MAPLE_OPENCLAW_AGENT_ENABLED || "").trim() === "1";

const gatewayPort = Number(process.env.GATEWAY_PORT || "3000");
const frontendAPort = Number(process.env.FRONTEND_A_PORT || "4101");
const frontendBPort = Number(process.env.FRONTEND_B_PORT || "4102");
const frontendCPort = Number(process.env.FRONTEND_C_PORT || "4103");
const auditWriterPort = Number(process.env.AUDIT_WRITER_PORT || "19400");
const auditWriterHttpPort = Number(process.env.AUDIT_WRITER_HTTP_PORT || "19401");
const contextWallPort = Number(process.env.CONTEXT_WALL_PORT || "19000");
const mcpProxyPort = Number(process.env.MCP_PROXY_PORT || "19200");
const cyberProxyPort = Number(process.env.CYBER_PROXY_PORT || "18080");
const openClawGatewayPort = Number(process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_PORT || "19001");
const openClawBridgePort = Number(process.env.OPENCLAW_BRIDGE_PORT || "8787");
const toolhubPort = Number(process.env.MAPLE_TOOLHUB_PORT || "8788");
const gatewayOrigin = String(
  process.env.MAPLE_GATEWAY_ORIGIN || process.env.MCP_URL || `http://127.0.0.1:${gatewayPort}`
)
  .trim()
  .replace(/\/+$/g, "");
const localStorageFile = resolve(stateDir, "node-localstorage.json");

function buildNodeOptions(extraFlag) {
  const existing = String(process.env.NODE_OPTIONS || "").trim();
  if (existing.includes("--localstorage-file")) {
    return existing;
  }
  return `${existing} ${extraFlag}`.trim();
}

function resolveDownstreamApps() {
  const raw = String(process.env.MAPLE_DOWNSTREAM_APPS || "").trim();
  if (raw.length > 0 && raw !== "[]") {
    return { raw, autoSeeded: false };
  }

  return {
    raw: JSON.stringify([
      {
        id: "local-toolhub",
        name: "Local Toolhub",
        mcpUrl: `http://127.0.0.1:${toolhubPort}/mcp`,
        enabled: true,
      },
    ]),
    autoSeeded: true,
  };
}

const downstreamApps = resolveDownstreamApps();

const sharedDevEnv = {
  MCP_URL: gatewayOrigin,
  MAPLE_GATEWAY_ORIGIN: gatewayOrigin,
  MAPLE_DOWNSTREAM_APPS: downstreamApps.raw,
  NODE_OPTIONS: buildNodeOptions(`--localstorage-file=${localStorageFile}`),
  ...(downstreamApps.autoSeeded
    ? {
        MAPLE_MCP_FIREWALL_DEFAULT_APP: "local-toolhub",
        MAPLE_MCP_EXECUTION_ORDER: "local-toolhub",
      }
    : {}),
};

const backendProcesses = [
  {
    name: "audit-writer",
    command: "node backend/backendB-core-services/audit-writer/service/src/main.js",
    port: auditWriterPort,
    readyUrl: `http://127.0.0.1:${auditWriterHttpPort}/ready`,
    env: sharedDevEnv,
  },
  {
    name: "context-wall",
    command: "node backend/backendB-core-services/context-wall/service/src/main.js",
    port: contextWallPort,
    readyUrl: `http://127.0.0.1:${contextWallPort + 1000}/ready`,
    env: sharedDevEnv,
  },
  {
    name: "mcp-proxy",
    command: "node backend/backendB-core-services/mcp-proxy/service/src/main.js",
    port: mcpProxyPort,
    readyUrl: `http://127.0.0.1:${mcpProxyPort + 1000}/ready`,
    env: sharedDevEnv,
  },
  {
    name: "cyber-proxy",
    command: "node backend/backendB-core-services/cyber-proxy/service/src/main.js",
    port: cyberProxyPort,
    readyUrl: `http://127.0.0.1:${cyberProxyPort + 1000}/ready`,
    env: sharedDevEnv,
  },
  {
    name: "toolhub",
    command: "node backend/backendA-platform-infra/scripts/hackathon-toolhub.mjs",
    port: toolhubPort,
    env: sharedDevEnv,
    critical: false,
  },
];

const gatewayProcesses = [
  {
    name: "gateway-api",
    command: "node backend/backendB-core-services/gateway-api/service/src/main.js",
    port: gatewayPort,
    readyUrl: `${gatewayOrigin}/health`,
    env: sharedDevEnv,
  },
];

const frontendProcesses = [
  {
    name: "frontendA",
    command: `npm --prefix frontend/frontendA-it-console/template-runtime run dev -- --port ${frontendAPort}`,
    port: frontendAPort,
    readyUrl: `http://127.0.0.1:${frontendAPort}/attachments`,
    env: sharedDevEnv,
    readyStatuses: [200],
    critical: false,
  },
  {
    name: "frontendB",
    command: `NEXT_PUBLIC_DISABLE_REACTFLOW=1 npm --prefix frontend/frontendB-desktop-app/template-runtime run dev -- --port ${frontendBPort}`,
    port: frontendBPort,
    readyUrl: `http://127.0.0.1:${frontendBPort}/login`,
    env: sharedDevEnv,
    readyStatuses: [200],
    critical: false,
  },
  {
    name: "frontendC",
    command: `npm --prefix frontend/frontendC-marketing-download-site/template-runtime run dev -- --port ${frontendCPort}`,
    port: frontendCPort,
    readyUrl: `http://127.0.0.1:${frontendCPort}/login`,
    env: sharedDevEnv,
    readyStatuses: [200],
    critical: false,
  },
];

const openClawProcesses = openClawEnabled
  ? [
      {
        name: "openclaw-gateway",
        command: `openclaw --dev gateway run --port ${openClawGatewayPort} --allow-unconfigured --verbose`,
        port: openClawGatewayPort,
        env: sharedDevEnv,
        critical: false,
      },
      {
        name: "openclaw-bridge",
        command: "node backend/backendA-platform-infra/scripts/openclaw-bridge-hardcoded.mjs",
        port: openClawBridgePort,
        env: sharedDevEnv,
        critical: false,
      },
    ]
  : [];

(async () => {
  try {
    console.log(
      `[dev-fast] Starting ${backendProcesses.length + gatewayProcesses.length + frontendProcesses.length + openClawProcesses.length} processes...`
    );
    await startGroup("backend dependencies", [...backendProcesses, ...openClawProcesses]);
    await startGroup("gateway", gatewayProcesses);
    await startGroup("frontends", frontendProcesses);

    console.log("");
    console.log("[dev-fast] Local fast loop is ready.");
    console.log(`  Gateway:   http://127.0.0.1:${gatewayPort}`);
    console.log(`  FrontendA: http://127.0.0.1:${frontendAPort}`);
    console.log(`  FrontendB: http://127.0.0.1:${frontendBPort}`);
    console.log(`  FrontendC: http://127.0.0.1:${frontendCPort}`);
    if (openClawEnabled) {
      console.log(`  OpenClaw gateway: ws://127.0.0.1:${process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_PORT || "19001"}`);
      console.log(`  OpenClaw bridge:  http://127.0.0.1:${process.env.OPENCLAW_BRIDGE_PORT || "8787"}/health`);
    }
    console.log(`  Logs: ${logDir}`);
    console.log("Press Ctrl+C to stop all local processes.");

    setInterval(() => {
      writeStateFile();
    }, 10_000).unref();
  } catch (error) {
    console.error(`[dev-fast] Failed to start: ${error instanceof Error ? error.message : String(error)}`);
    await shutdown(1);
  }
})();
