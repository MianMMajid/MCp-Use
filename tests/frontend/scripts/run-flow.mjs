import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const quick = args.has("--quick");
const ci = args.has("--ci");
const skipBrowserInstall = args.has("--skip-browser-install");

const steps = [];

if (!skipBrowserInstall) {
  steps.push(
    ci
      ? { label: "Install Playwright browser dependencies", cmd: "npm", args: ["run", "test:frontend:setup:ci"] }
      : { label: "Install Playwright Chromium", cmd: "npm", args: ["run", "test:frontend:setup"] }
  );
}

steps.push({ label: "Run frontend unit tests", cmd: "npm", args: ["run", "test:frontend:unit"] });

if (!quick) {
  steps.push({ label: "Run frontend coverage", cmd: "npm", args: ["run", "test:frontend:coverage"] });
}

steps.push({ label: "Run frontend e2e tests", cmd: "npm", args: ["run", "test:frontend:e2e"] });

for (const [index, step] of steps.entries()) {
  process.stdout.write(`\n[frontend-flow ${index + 1}/${steps.length}] ${step.label}\n`);
  const result = spawnSync(step.cmd, step.args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    const code = result.status ?? 1;
    process.stderr.write(`\n[frontend-flow] Failed: ${step.label} (exit ${code})\n`);
    process.exit(code);
  }
}

process.stdout.write("\n[frontend-flow] All stages passed.\n");
