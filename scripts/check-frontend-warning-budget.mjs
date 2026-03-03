#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
  const map = new Map();
  for (let i = 2; i < argv.length; i += 1) {
    const token = String(argv[i] ?? "");
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !String(next).startsWith("--")) {
      map.set(key, String(next));
      i += 1;
      continue;
    }
    map.set(key, "true");
  }
  return map;
}

const args = parseArgs(process.argv);
const logPath = resolve(process.cwd(), args.get("log") ?? "artifacts/matrix/frontend-flow.log");
const content = readFileSync(logPath, "utf8");
const lines = content.split(/\r?\n/);

const warningSignal = /warning|deprecated|⚠/i;
const allowlist = [
  /NO_COLOR.*FORCE_COLOR/i,
  /MAPLE_GATEWAY_ORIGIN is not set/i,
  /Cross origin request detected from 127\.0\.0\.1/i,
];

const violations = [];
for (const line of lines) {
  if (!warningSignal.test(line)) continue;
  const allowed = allowlist.some((pattern) => pattern.test(line));
  if (!allowed) {
    violations.push(line.trim());
  }
}

if (violations.length > 0) {
  process.stderr.write("[frontend-warning-budget] non-allowlisted warnings found:\n");
  for (const warning of violations) {
    process.stderr.write(`- ${warning}\n`);
  }
  process.exit(1);
}

process.stdout.write("[frontend-warning-budget] OK: warning budget within allowlist.\n");
