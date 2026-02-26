"use strict";

const { spawn } = require("node:child_process");
const { resolve } = require("node:path");

function parseCommandLine(commandLine) {
  if (!commandLine || typeof commandLine !== "string") {
    return null;
  }
  const trimmed = commandLine.trim();
  if (!trimmed) {
    return null;
  }
  const parts = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g);
  if (!parts || parts.length === 0) {
    return null;
  }
  const normalized = parts.map((part) => part.replace(/^"|"$/g, ""));
  const [command, ...args] = normalized;
  return { command, args };
}

async function probeHealth(url) {
  if (!url) {
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

class RuntimeController {
  constructor(options = {}) {
    const repoRoot = resolve(__dirname, "../../..");
    const modeEnv = String(process.env.MAPLE_DESKTOP_RUNTIME_MODE ?? "external").trim().toLowerCase();
    const commandEnv = process.env.MAPLE_DESKTOP_RUNTIME_COMMAND;
    const commandArgsEnv = process.env.MAPLE_DESKTOP_RUNTIME_ARGS;

    this.mode = options.mode ?? (modeEnv === "managed" ? "managed" : "external");
    this.healthUrl =
      options.healthUrl ??
      process.env.MAPLE_DESKTOP_RUNTIME_HEALTH_URL ??
      "http://127.0.0.1:3000/health";
    this.cwd = options.cwd ?? process.env.MAPLE_DESKTOP_RUNTIME_CWD ?? repoRoot;

    this.commandConfig = options.commandConfig ?? parseCommandLine(commandEnv);
    this.commandArgs =
      options.commandArgs ??
      (typeof commandArgsEnv === "string" && commandArgsEnv.trim().length > 0
        ? commandArgsEnv.split(/\s+/g).filter(Boolean)
        : null);

    this.child = null;
    this.startedAt = null;
    this.lastExitCode = null;
    this.lastExitSignal = null;
    this.logLines = [];
    this.maxLogLines = 300;
  }

  appendLog(line) {
    if (typeof line !== "string") {
      return;
    }
    this.logLines.push(line);
    if (this.logLines.length > this.maxLogLines) {
      this.logLines.splice(0, this.logLines.length - this.maxLogLines);
    }
  }

  resolveStartCommand() {
    if (this.commandConfig?.command) {
      const args = Array.isArray(this.commandArgs) ? this.commandArgs : this.commandConfig.args;
      return {
        command: this.commandConfig.command,
        args: Array.isArray(args) ? args : [],
      };
    }

    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    return { command, args: ["run", "start"] };
  }

  isRunning() {
    return Boolean(this.child && this.child.exitCode === null && !this.child.killed);
  }

  async getStatus() {
    return {
      mode: this.mode,
      running: this.isRunning(),
      pid: this.child?.pid ?? null,
      startedAt: this.startedAt,
      lastExitCode: this.lastExitCode,
      lastExitSignal: this.lastExitSignal,
      healthUrl: this.healthUrl,
      healthy: await probeHealth(this.healthUrl),
      cwd: this.cwd,
    };
  }

  getLogs(limit = 120) {
    const normalizedLimit =
      Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), this.maxLogLines) : 120;
    return this.logLines.slice(-normalizedLimit);
  }

  async start() {
    if (this.mode !== "managed") {
      return {
        ok: false,
        error: "Managed runtime disabled. Set MAPLE_DESKTOP_RUNTIME_MODE=managed to enable.",
        status: await this.getStatus(),
      };
    }

    if (this.isRunning()) {
      return { ok: true, alreadyRunning: true, status: await this.getStatus() };
    }

    const { command, args } = this.resolveStartCommand();
    this.appendLog(`[runtime] starting: ${command} ${(args || []).join(" ")}`.trim());
    this.appendLog(`[runtime] cwd: ${this.cwd}`);

    this.child = spawn(command, args, {
      cwd: this.cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.startedAt = new Date().toISOString();
    this.lastExitCode = null;
    this.lastExitSignal = null;

    this.child.stdout?.on("data", (chunk) => {
      const lines = String(chunk).split(/\r?\n/g);
      for (const line of lines) {
        if (line.trim().length > 0) {
          this.appendLog(`[stdout] ${line}`);
        }
      }
    });

    this.child.stderr?.on("data", (chunk) => {
      const lines = String(chunk).split(/\r?\n/g);
      for (const line of lines) {
        if (line.trim().length > 0) {
          this.appendLog(`[stderr] ${line}`);
        }
      }
    });

    this.child.on("error", (error) => {
      this.appendLog(`[runtime] process error: ${error.message}`);
    });

    this.child.on("exit", (code, signal) => {
      this.lastExitCode = code;
      this.lastExitSignal = signal;
      this.appendLog(`[runtime] process exited (code=${String(code)}, signal=${String(signal)})`);
    });

    return { ok: true, status: await this.getStatus() };
  }

  async stop() {
    if (!this.isRunning()) {
      return { ok: true, alreadyStopped: true, status: await this.getStatus() };
    }

    this.appendLog("[runtime] stopping process");
    this.child.kill("SIGTERM");

    await new Promise((resolvePromise) => {
      const timeout = setTimeout(() => {
        if (this.isRunning()) {
          this.appendLog("[runtime] force killing process");
          this.child.kill("SIGKILL");
        }
        resolvePromise();
      }, 3000);

      this.child.once("exit", () => {
        clearTimeout(timeout);
        resolvePromise();
      });
    });

    return { ok: true, status: await this.getStatus() };
  }
}

function createRuntimeController(options = {}) {
  return new RuntimeController(options);
}

module.exports = {
  createRuntimeController,
};
