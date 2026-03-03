import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const quick = args.has("--quick");
const ci = args.has("--ci");
const skipBrowserInstall = args.has("--skip-browser-install");
const coveragePolicy = String(process.env.COVERAGE_POLICY || "advisory").toLowerCase();

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

for (const [index, step] of steps.entries()) {
  process.stdout.write(`\n[frontend-flow ${index + 1}/${steps.length}] ${step.label}\n`);
  const result = spawnSync(step.cmd, step.args, {
    stdio: "inherit",
    env: process.env,
  });

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
