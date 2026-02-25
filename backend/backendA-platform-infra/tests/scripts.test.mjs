import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";
import test from "node:test";

function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        rejectPort(new Error("Unable to resolve free port"));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          rejectPort(error);
          return;
        }
        resolvePort(port);
      });
    });
    server.on("error", rejectPort);
  });
}

async function waitForHealth(url, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

test("service-shell script serves /health and /info", async () => {
  const port = await getFreePort();
  const scriptPath = resolve(
    "backend/backendA-platform-infra/scripts/service-shell.mjs"
  );

  const child = spawn(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      SERVICE_NAME: "test-shell",
      PORT: String(port),
    },
    stdio: "ignore",
  });

  try {
    await waitForHealth(`http://127.0.0.1:${port}/health`);
    const infoRes = await fetch(`http://127.0.0.1:${port}/info`);
    assert.equal(infoRes.ok, true);
    const infoBody = await infoRes.json();
    assert.equal(infoBody.service, "test-shell");
    assert.equal(infoBody.status, "running");
  } finally {
    child.kill("SIGTERM");
  }
});

test("service source validator accepts single-service mode", async () => {
  const scriptPath = resolve(
    "backend/backendA-platform-infra/scripts/check-service-sources.mjs"
  );
  const child = spawn(process.execPath, [scriptPath, "context-wall"], {
    stdio: "pipe",
  });
  const exitCode = await new Promise((resolveExit) => {
    child.on("exit", (code) => resolveExit(code ?? 1));
  });
  assert.equal(exitCode, 0);
});
