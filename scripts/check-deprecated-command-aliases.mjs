#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJsonPath = resolve(rootDir, "package.json");
const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const scripts = pkg.scripts ?? {};

const deprecatedAliasMap = {
  "dev:frontendA:template": "dev:frontendA",
  "dev:frontendB:template": "dev:frontendB",
  "dev:frontendC:template": "dev:frontendC",
  "build:frontendA:template": "build:frontendA",
  "build:frontendB:template": "build:frontendB",
  "build:frontendC:template": "build:frontendC",
};

const deprecatedAliasPattern = /^(dev|build):frontend[ABC]:template$/;
const foundDeprecatedAliases = Object.keys(scripts).filter((name) => deprecatedAliasPattern.test(name));
const violations = [];

for (const aliasName of foundDeprecatedAliases) {
  if (!(aliasName in deprecatedAliasMap)) {
    violations.push(`Unexpected deprecated alias script added: ${aliasName}`);
    continue;
  }
  const expectedValue = `npm run ${deprecatedAliasMap[aliasName]}`;
  if (scripts[aliasName] !== expectedValue) {
    violations.push(
      `Deprecated alias "${aliasName}" must map to "${expectedValue}" when present (found "${scripts[aliasName]}")`,
    );
  }
}

if (violations.length > 0) {
  process.stderr.write("[command-alias-guard] violations found:\n");
  for (const violation of violations) {
    process.stderr.write(`- ${violation}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `[command-alias-guard] OK: deprecated aliases controlled (${foundDeprecatedAliases.length} present, ${Object.keys(deprecatedAliasMap).length} mapped).\n`,
);
