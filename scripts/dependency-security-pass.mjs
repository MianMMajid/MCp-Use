#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_DIR = resolve(ROOT_DIR, "artifacts/debt");
const JSON_OUT = resolve(ARTIFACT_DIR, "dependency-security-report.json");
const MD_OUT = resolve(ARTIFACT_DIR, "dependency-security-report.md");
const ALLOWLIST_FILE = resolve(ROOT_DIR, "docs/dependency-security-allowlist.json");

function asBool(value, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function nowIso() {
  return new Date().toISOString();
}

const LOCKFILES = [
  "package-lock.json",
  "frontend/frontendA-it-console/template-runtime/package-lock.json",
  "frontend/frontendB-desktop-app/package-lock.json",
  "frontend/frontendB-desktop-app/template-runtime/package-lock.json",
  "frontend/frontendC-marketing-download-site/template-runtime/package-lock.json",
].map((item) => resolve(ROOT_DIR, item)).filter((item) => existsSync(item));

function ownerForWorkspace(workspaceDir) {
  const normalized = workspaceDir.replace(`${ROOT_DIR}/`, "");
  if (normalized.startsWith("frontend/frontendA-it-console")) return "frontendA-owner";
  if (normalized.startsWith("frontend/frontendB-desktop-app/template-runtime")) return "frontendB-runtime-owner";
  if (normalized.startsWith("frontend/frontendB-desktop-app")) return "frontendB-desktop-owner";
  if (normalized.startsWith("frontend/frontendC-marketing-download-site")) return "frontendC-owner";
  return "platform-owner";
}

function runJsonCommand(cmd, args, cwd) {
  const run = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_loglevel: "error" },
    maxBuffer: 1024 * 1024 * 64,
  });
  const stdout = String(run.stdout ?? "").trim();
  const stderr = String(run.stderr ?? "").trim();
  if (!stdout) {
    return { ok: false, code: run.status ?? 1, parsed: null, stderr, stdout };
  }
  try {
    const parsed = JSON.parse(stdout);
    return { ok: true, code: run.status ?? 0, parsed, stderr, stdout };
  } catch {
    return { ok: false, code: run.status ?? 1, parsed: null, stderr, stdout };
  }
}

function collectDeprecatedDependencies(tree, found = new Map(), lineage = []) {
  if (!tree || typeof tree !== "object") return found;
  const deps = tree.dependencies && typeof tree.dependencies === "object" ? tree.dependencies : {};
  for (const [name, node] of Object.entries(deps)) {
    if (!node || typeof node !== "object") continue;
    const chain = [...lineage, name];
    if (typeof node.deprecated === "string" && node.deprecated.trim()) {
      if (!found.has(name)) {
        found.set(name, {
          name,
          version: String(node.version ?? "unknown"),
          message: node.deprecated,
          examplePath: chain.join(" > "),
        });
      }
    }
    collectDeprecatedDependencies(node, found, chain);
  }
  return found;
}

function parseVulnerabilitySummary(auditJson) {
  const summary = auditJson?.metadata?.vulnerabilities ?? {};
  return {
    critical: Number(summary.critical ?? 0),
    high: Number(summary.high ?? 0),
    moderate: Number(summary.moderate ?? 0),
    low: Number(summary.low ?? 0),
    info: Number(summary.info ?? 0),
    total: Number(summary.total ?? 0),
  };
}

function buildDecision(vuln, deprecatedCount) {
  if (vuln.critical > 0 || vuln.high > 0) {
    return "upgrade_or_replace_now";
  }
  if (vuln.moderate > 0) {
    return "upgrade_next_sprint";
  }
  if (deprecatedCount > 0 || vuln.low > 0) {
    return "review_and_schedule";
  }
  return "monitor";
}

function dueDateFromDecision(decision) {
  const now = new Date();
  const days =
    decision === "upgrade_or_replace_now"
      ? 7
      : decision === "upgrade_next_sprint"
      ? 14
      : decision === "review_and_schedule"
      ? 30
      : 60;
  const due = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return due.toISOString().slice(0, 10);
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_FILE)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(ALLOWLIST_FILE, "utf8"));
    const entries = Array.isArray(parsed?.exceptions) ? parsed.exceptions : [];
    return entries
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        workspace: String(entry.workspace ?? "").trim(),
        owner: String(entry.owner ?? "").trim(),
        reason: String(entry.reason ?? "").trim(),
        expiresAt: String(entry.expiresAt ?? "").trim(),
        maxHigh: Number.isFinite(Number(entry.maxHigh)) ? Number(entry.maxHigh) : 0,
        maxCritical: Number.isFinite(Number(entry.maxCritical)) ? Number(entry.maxCritical) : 0,
      }))
      .filter((entry) => entry.workspace.length > 0 && entry.owner.length > 0 && entry.expiresAt.length > 0);
  } catch {
    return [];
  }
}

function activeAllowanceForWorkspace(workspace, allowlist, asOfIso) {
  const now = new Date(asOfIso).getTime();
  return allowlist.find((entry) => {
    if (entry.workspace !== workspace) return false;
    const expiresAt = Date.parse(entry.expiresAt);
    if (!Number.isFinite(expiresAt)) return false;
    return expiresAt >= now;
  }) ?? null;
}

function workspaceReport(lockfilePath) {
  const workspaceDir = dirname(lockfilePath);
  const relWorkspace = workspaceDir === ROOT_DIR ? "." : workspaceDir.replace(`${ROOT_DIR}/`, "");

  const auditRun = runJsonCommand("npm", ["audit", "--json"], workspaceDir);
  const vuln = auditRun.parsed ? parseVulnerabilitySummary(auditRun.parsed) : {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    info: 0,
    total: 0,
  };

  const lsRun = runJsonCommand("npm", ["ls", "--all", "--json"], workspaceDir);
  const deprecated = lsRun.parsed ? [...collectDeprecatedDependencies(lsRun.parsed).values()] : [];

  const decision = buildDecision(vuln, deprecated.length);
  return {
    workspace: relWorkspace,
    lockfile: lockfilePath.replace(`${ROOT_DIR}/`, ""),
    owner: ownerForWorkspace(workspaceDir),
    vulnerabilities: vuln,
    deprecatedCount: deprecated.length,
    deprecatedTop: deprecated.slice(0, 20),
    decision,
    dueDate: dueDateFromDecision(decision),
    auditOk: auditRun.ok,
    lsOk: lsRun.ok,
    auditError: auditRun.ok ? "" : (auditRun.stderr || "npm audit output parse failed"),
    lsError: lsRun.ok ? "" : (lsRun.stderr || "npm ls output parse failed"),
  };
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# Dependency/Security Debt Report");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("| Workspace | Owner | Critical | High | Moderate | Deprecated | Decision | Due Date |");
  lines.push("|---|---|---:|---:|---:|---:|---|---|");
  for (const row of report.workspaces) {
    const policySuffix = row.policyViolation
      ? " (policy_violation)"
      : row.allowance
      ? " (allowlisted)"
      : "";
    lines.push(
      `| ${row.workspace} | ${row.owner} | ${row.vulnerabilities.critical} | ${row.vulnerabilities.high} | ${row.vulnerabilities.moderate} | ${row.deprecatedCount} | ${row.decision}${policySuffix} | ${row.dueDate} |`,
    );
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  for (const row of report.workspaces) {
    if (row.auditError || row.lsError) {
      lines.push(`- ${row.workspace}: audit/ls parsing had issues; verify manually.`);
    }
    if (row.allowance) {
      lines.push(
        `- ${row.workspace}: temporary exception active until ${row.allowance.expiresAt} (owner: ${row.allowance.owner}).`,
      );
    }
    if (row.deprecatedTop.length > 0) {
      const sample = row.deprecatedTop.slice(0, 3).map((item) => `${item.name}@${item.version}`).join(", ");
      lines.push(`- ${row.workspace}: sample deprecated packages: ${sample}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const policyNow = nowIso();
  const blockHighCritical = asBool(process.env.DEPENDENCY_SECURITY_BLOCK_HIGH_CRITICAL, true);
  const allowlist = loadAllowlist();
  const reports = LOCKFILES.map(workspaceReport).map((row) => {
    const allowance = activeAllowanceForWorkspace(row.workspace, allowlist, policyNow);
    const maxHigh = allowance?.maxHigh ?? 0;
    const maxCritical = allowance?.maxCritical ?? 0;
    const policyViolation = blockHighCritical
      ? row.vulnerabilities.high > maxHigh || row.vulnerabilities.critical > maxCritical
      : false;
    return {
      ...row,
      allowance,
      policyViolation,
    };
  });
  const totals = reports.reduce(
    (acc, row) => {
      acc.critical += row.vulnerabilities.critical;
      acc.high += row.vulnerabilities.high;
      acc.moderate += row.vulnerabilities.moderate;
      acc.low += row.vulnerabilities.low;
      acc.deprecated += row.deprecatedCount;
      return acc;
    },
    { critical: 0, high: 0, moderate: 0, low: 0, deprecated: 0 },
  );

  const report = {
    artifactSchemaVersion: 1,
    generatedAt: new Date().toISOString(),
    policy: {
      blockHighCritical,
      allowlistFile: ALLOWLIST_FILE.replace(`${ROOT_DIR}/`, ""),
      evaluatedAt: policyNow,
    },
    ok: reports.every((row) => row.auditOk && row.lsOk && !row.policyViolation),
    totals,
    workspaces: reports,
  };

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  writeFileSync(MD_OUT, toMarkdown(report));

  process.stdout.write(`[dependency-security] Report: ${JSON_OUT}\n`);
  if (!report.ok) {
    process.exit(1);
  }
}

main();
