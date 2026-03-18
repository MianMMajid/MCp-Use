#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const [
  { CLI_SURFACE_MANIFEST },
  routeRegistryModule,
  parityModule,
] = await Promise.all([
  import(resolve(repoRoot, "cli/surface-manifest.js")),
  import(resolve(repoRoot, "frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/route-registry.js")),
  import(resolve(repoRoot, "frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/frontendA-parity-spec.js")),
]);

const { MAPLE_ROUTE_REGISTRY, MAPLE_WORKSPACE_PATH_PREFIX } = routeRegistryModule;
const {
  FRONTEND_A_CANONICAL_SURFACE,
  FRONTEND_A_PARITY_CAPABILITIES,
  FRONTEND_A_PARITY_BY_ROUTE,
  FRONTEND_A_PARITY_CRITICAL_SVELTE_SURFACES,
  isValidFrontendAActionability,
  isValidFrontendACliParityMode,
  isValidFrontendAParityStatus,
  isValidFrontendASecurityDomain,
} = parityModule;

const errors = [];
const warnings = [];

const frontendARoot = resolve(repoRoot, "frontend/frontendA-it-console");
const templateRuntimeRoot = resolve(frontendARoot, "template-runtime");
const routePaths = new Set(MAPLE_ROUTE_REGISTRY.map((route) => route.path));
const manifestPathSet = new Set(
  CLI_SURFACE_MANIFEST.flatMap((entry) => [
    entry.path,
    entry.startPath,
    entry.statusPath,
    ...(Array.isArray(entry.frontendPaths) ? entry.frontendPaths : []),
  ]).filter(Boolean),
);
const manifestCommandSet = new Set(
  CLI_SURFACE_MANIFEST
    .map((entry) => Array.isArray(entry.commandPath) ? entry.commandPath.join(" ") : "")
    .filter(Boolean),
);
const manifestMatchers = [...manifestPathSet].map((entry) => ({
  entry,
  regex: new RegExp(`^${escapeRegex(entry).replace(/:[A-Za-z0-9_]+/g, "[^/]+")}$`),
}));

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function warn(condition, message) {
  if (!condition) {
    warnings.push(message);
  }
}

function fileExistsFromTemplateRuntime(relativePath) {
  return existsSync(resolve(templateRuntimeRoot, relativePath));
}

function fileIncludes(relativePath, pattern) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) return false;
  return readFileSync(absolutePath, "utf8").includes(pattern);
}

function isManifestPathCovered(candidatePath) {
  return manifestMatchers.some((matcher) => matcher.regex.test(candidatePath))
    || [...manifestPathSet].some((manifestPath) => manifestPath.startsWith(`${candidatePath}/`));
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

assert(
  FRONTEND_A_CANONICAL_SURFACE.frontendRouteEntry === "src/routes/maple/+layout.svelte",
  "Canonical frontend A route entry must point at src/routes/maple/+layout.svelte.",
);
assert(
  FRONTEND_A_CANONICAL_SURFACE.canonicalPathPrefix === MAPLE_WORKSPACE_PATH_PREFIX,
  "Canonical frontend A path prefix must match the Maple workspace prefix.",
);
assert(
  fileExistsFromTemplateRuntime(FRONTEND_A_CANONICAL_SURFACE.frontendRouteEntry),
  `Canonical frontend A route entry is missing: ${FRONTEND_A_CANONICAL_SURFACE.frontendRouteEntry}`,
);
assert(
  fileExistsFromTemplateRuntime(FRONTEND_A_CANONICAL_SURFACE.workspaceShell),
  `Canonical frontend A shell is missing: ${FRONTEND_A_CANONICAL_SURFACE.workspaceShell}`,
);

for (const criticalSurface of FRONTEND_A_PARITY_CRITICAL_SVELTE_SURFACES) {
  assert(
    fileExistsFromTemplateRuntime(criticalSurface),
    `Parity-critical Svelte surface is missing: ${criticalSurface}`,
  );
}

for (const route of MAPLE_ROUTE_REGISTRY) {
  if (!route.path.startsWith(MAPLE_WORKSPACE_PATH_PREFIX)) continue;
  const parity = FRONTEND_A_PARITY_BY_ROUTE[route.path];
  assert(parity, `Route ${route.path} is missing frontend A parity metadata.`);
  if (!parity) continue;

  assert(
    Array.isArray(route.capabilityIds) && route.capabilityIds.length > 0,
    `Route ${route.path} must expose capabilityIds in the route registry.`,
  );
  assert(
    Array.isArray(route.securityDomains) && route.securityDomains.length > 0,
    `Route ${route.path} must expose securityDomains in the route registry.`,
  );
  assert(
    typeof route.parityStatus === "string" && route.parityStatus.length > 0,
    `Route ${route.path} must expose parityStatus in the route registry.`,
  );
  assert(
    Array.isArray(route.svelteSurfaces) && route.svelteSurfaces.length > 0,
    `Route ${route.path} must expose Svelte surfaces in the route registry.`,
  );
  assert(
    JSON.stringify(unique(route.capabilityIds)) === JSON.stringify(unique(parity.capabilityIds)),
    `Route ${route.path} capabilityIds drift from the canonical parity matrix.`,
  );
}

for (const capability of FRONTEND_A_PARITY_CAPABILITIES) {
  assert(capability.capabilityId, "Every parity capability must define capabilityId.");
  assert(capability.title, `Capability ${capability.capabilityId} must define a title.`);
  assert(
    isValidFrontendASecurityDomain(capability.securityDomain),
    `Capability ${capability.capabilityId} has invalid securityDomain: ${capability.securityDomain}`,
  );
  assert(
    isValidFrontendAParityStatus(capability.status),
    `Capability ${capability.capabilityId} has invalid status: ${capability.status}`,
  );
  assert(
    isValidFrontendAActionability(capability.actionability),
    `Capability ${capability.capabilityId} has invalid actionability: ${capability.actionability}`,
  );
  assert(
    isValidFrontendACliParityMode(capability.cliParityMode),
    `Capability ${capability.capabilityId} has invalid cliParityMode: ${capability.cliParityMode}`,
  );
  assert(
    routePaths.has(capability.frontendRoute),
    `Capability ${capability.capabilityId} points at unknown frontend route: ${capability.frontendRoute}`,
  );
  assert(
    fileExistsFromTemplateRuntime(capability.svelteSurface),
    `Capability ${capability.capabilityId} points at missing Svelte surface: ${capability.svelteSurface}`,
  );

  if (capability.status !== "retired") {
    assert(
      Array.isArray(capability.backendApis) && capability.backendApis.length > 0,
      `Capability ${capability.capabilityId} must declare backend APIs unless retired.`,
    );
  }

  for (const apiPath of capability.backendApis) {
    assert(
      isManifestPathCovered(apiPath),
      `Capability ${capability.capabilityId} backend API lacks CLI manifest coverage: ${apiPath}`,
    );
  }

  if (capability.cliParityMode === "required") {
    assert(
      capability.cliCommands.length > 0,
      `Capability ${capability.capabilityId} requires CLI parity but does not list CLI commands.`,
    );
  }

  for (const command of capability.cliCommands) {
    if (!manifestCommandSet.has(command)) {
      errors.push(`Capability ${capability.capabilityId} references unknown CLI command: ${command}`);
    }
  }

  if (capability.legacySource) {
    assert(
      capability.status === "retired" || capability.frontendRoute.startsWith("/maple/"),
      `Legacy-derived capability ${capability.capabilityId} must map to /maple or be retired.`,
    );
  }

  warn(
    !(capability.actionability === "operator_action" && capability.cliParityMode === "frontend_only"),
    `Capability ${capability.capabilityId} is operator-actionable in the UI but frontend-only in CLI parity.`,
  );
}

const referencedCriticalSurfaces = new Set(
  FRONTEND_A_PARITY_CAPABILITIES.map((item) => item.svelteSurface),
);
for (const criticalSurface of FRONTEND_A_PARITY_CRITICAL_SVELTE_SURFACES) {
  assert(
    referencedCriticalSurfaces.has(criticalSurface),
    `Parity-critical Svelte surface is not referenced by the capability matrix: ${criticalSurface}`,
  );
}

assert(
  fileIncludes("frontend/frontendA-it-console/README.md", "src/routes/maple/+layout.svelte"),
  "frontend/frontendA-it-console/README.md must describe the canonical Svelte route entry.",
);
assert(
  fileIncludes("frontend/frontendA-it-console/README.md", "src/lib/svelte-workspace/"),
  "frontend/frontendA-it-console/README.md must describe Svelte workspace ownership.",
);
assert(
  !fileIncludes("frontend/frontendA-it-console/README.md", "src/app/ for route ownership"),
  "frontend/frontendA-it-console/README.md still describes src/app as the canonical frontend A route owner.",
);
assert(
  fileIncludes("frontend/frontendA-it-console/template-runtime/README.md", "SvelteKit `/maple` workspace"),
  "template-runtime/README.md must describe the SvelteKit /maple workspace as the canonical target.",
);
assert(
  fileIncludes(
    "frontend/frontendA-it-console/template-runtime/docs/a1-parity-matrix.md",
    "frontendA-parity-spec.js",
  ),
  "a1 parity docs must point at the machine-readable frontend A parity matrix.",
);
assert(
  fileIncludes(
    "frontend/frontendA-it-console/template-runtime/docs/frontendA-a1-parity-checklist.md",
    "frontendA-parity-spec.js",
  ),
  "A1 parity checklist must reference the canonical parity matrix.",
);

if (warnings.length > 0) {
  process.stderr.write("[frontendA-cli-parity] Warnings:\n");
  for (const warning of warnings) {
    process.stderr.write(`- ${warning}\n`);
  }
}

if (errors.length > 0) {
  process.stderr.write("[frontendA-cli-parity] Errors:\n");
  for (const error of errors) {
    process.stderr.write(`- ${error}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `[frontendA-cli-parity] OK: ${FRONTEND_A_PARITY_CAPABILITIES.length} capabilities across ${MAPLE_ROUTE_REGISTRY.length} canonical /maple routes.\n`,
);
