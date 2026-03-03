import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const quick = args.has("--quick");
const ci = args.has("--ci");
const skipBrowserInstall = args.has("--skip-browser-install");
const coveragePolicy = String(process.env.COVERAGE_POLICY || "advisory").toLowerCase();
const warningBudgetEnabled = ci || String(process.env.FRONTEND_WARNING_BUDGET || "0") === "1";
const flowLogPath = resolve(process.cwd(), "artifacts/matrix/frontend-flow.log");
const flowLogChunks = [];

function cleanupNextDevLocks() {
  const lockFiles = [
    "frontend/frontendA-it-console/template-runtime/.next/dev/lock",
    "frontend/frontendB-desktop-app/template-runtime/.next/dev/lock",
    "frontend/frontendC-marketing-download-site/template-runtime/.next/dev/lock",
  ];
  for (const relativePath of lockFiles) {
    const absolutePath = resolve(process.cwd(), relativePath);
    rmSync(absolutePath, { force: true });
  }
}

const steps = [];

if (!skipBrowserInstall) {
  steps.push(
    ci
      ? { label: "Install Playwright browser dependencies", cmd: "npm", args: ["run", "test:frontend:setup:ci"], required: true }
      : { label: "Install Playwright Chromium", cmd: "npm", args: ["run", "test:frontend:setup"], required: true }
  );
}

steps.push({ label: "Run frontend unit tests", cmd: "npm", args: ["run", "test:frontend:unit"], required: true });

if (!quick) {
  if (!ci) {
    steps.push({ label: "Run frontend coverage", cmd: "npm", args: ["run", "test:frontend:coverage"], required: true });
  } else if (coveragePolicy === "required") {
    steps.push({ label: "Run frontend coverage (required)", cmd: "npm", args: ["run", "test:frontend:coverage"], required: true });
  } else if (coveragePolicy === "advisory") {
    steps.push({ label: "Run frontend coverage (advisory)", cmd: "npm", args: ["run", "test:frontend:coverage"], required: false });
  } else {
    process.stderr.write(`[frontend-flow] Invalid COVERAGE_POLICY: ${coveragePolicy}\n`);
    process.exit(2);
  }
}

steps.push({ label: "Run frontend e2e tests", cmd: "npm", args: ["run", "test:frontend:e2e"], required: true });

if (warningBudgetEnabled) {
  steps.push({
    label: "Check frontend warning budget",
    cmd: "node",
    args: ["scripts/check-frontend-warning-budget.mjs", "--log", flowLogPath],
    required: true,
  });
}

for (const [index, step] of steps.entries()) {
  process.stdout.write(`\n[frontend-flow ${index + 1}/${steps.length}] ${step.label}\n`);
  if (step.label.toLowerCase().includes("e2e")) {
    cleanupNextDevLocks();
  }
  const stepEnv = { ...process.env };
  delete stepEnv.NO_COLOR;
  const result = spawnSync(step.cmd, step.args, {
    stdio: "pipe",
    env: stepEnv,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 32,
  });
  const stdout = String(result.stdout ?? "");
  const stderr = String(result.stderr ?? "");
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  flowLogChunks.push(`\n# ${step.label}\n`);
  if (stdout) flowLogChunks.push(stdout);
  if (stderr) flowLogChunks.push(stderr);
  mkdirSync(resolve(process.cwd(), "artifacts/matrix"), { recursive: true });
  writeFileSync(flowLogPath, flowLogChunks.join(""), "utf8");

  if (result.status !== 0) {
    const code = result.status ?? 1;
    if (step.required === false) {
      process.stderr.write(`\n[frontend-flow] Advisory step failed: ${step.label} (exit ${code})\n`);
      continue;
    }
    process.stderr.write(`\n[frontend-flow] Failed: ${step.label} (exit ${code})\n`);
    process.exit(code);
  }
}

process.stdout.write("\n[frontend-flow] All stages passed.\n");
