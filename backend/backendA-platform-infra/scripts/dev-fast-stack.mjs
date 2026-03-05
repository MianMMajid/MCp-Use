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
      console.error(`[dev-fast] Process exited unexpectedly: ${definition.name} (code=${code}, signal=${signal})`);
      void shutdown(1);
    }
  });

  managed.push(entry);
  return entry;
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

const processes = [
  { name: "audit-writer", command: "node backend/backendB-core-services/audit-writer/service/src/main.js", port: Number(process.env.AUDIT_WRITER_PORT || "19400") },
  { name: "context-wall", command: "node backend/backendB-core-services/context-wall/service/src/main.js", port: Number(process.env.CONTEXT_WALL_PORT || "19000") },
  { name: "mcp-proxy", command: "node backend/backendB-core-services/mcp-proxy/service/src/main.js", port: Number(process.env.MCP_PROXY_PORT || "19200") },
  { name: "cyber-proxy", command: "node backend/backendB-core-services/cyber-proxy/service/src/main.js", port: Number(process.env.CYBER_PROXY_PORT || "18080") },
  { name: "gateway-api", command: "node backend/backendB-core-services/gateway-api/service/src/main.js", port: gatewayPort },
  { name: "frontendA", command: `npm --prefix frontend/frontendA-it-console/template-runtime run dev -- --port ${frontendAPort}`, port: frontendAPort },
  {
    name: "frontendB",
    command: `NEXT_PUBLIC_DISABLE_REACTFLOW=1 npm --prefix frontend/frontendB-desktop-app/template-runtime run dev -- --port ${frontendBPort}`,
    port: frontendBPort,
  },
  { name: "frontendC", command: `npm --prefix frontend/frontendC-marketing-download-site/template-runtime run dev -- --port ${frontendCPort}`, port: frontendCPort },
];

if (openClawEnabled) {
  processes.unshift(
    {
      name: "openclaw-gateway",
      command: `openclaw --dev gateway run --port ${process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_PORT || "19001"} --allow-unconfigured --verbose`,
      port: Number(process.env.MAPLE_OPENCLAW_AGENT_GATEWAY_PORT || "19001"),
    },
    {
      name: "openclaw-bridge",
      command: "node backend/backendA-platform-infra/scripts/openclaw-bridge-hardcoded.mjs",
      port: Number(process.env.OPENCLAW_BRIDGE_PORT || "8787"),
    }
  );
}

(async () => {
  try {
    console.log(`[dev-fast] Starting ${processes.length} processes...`);
    for (const definition of processes) {
      startProcess(definition);
    }
    writeStateFile();

    for (const definition of processes) {
      if (!Number.isFinite(definition.port) || definition.port <= 0) {
        continue;
      }
      await waitForPort(definition.port, { timeoutMs: 240_000 });
    }

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
