import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_CALLGRAPH_FILE,
  ROOT_DIR,
  nowIso,
  parseArgs,
  writeJson,
} from "./service-audit-common.mjs";

const GATEWAY_SRC_ROOT = resolve(
  ROOT_DIR,
  "backend/backendB-core-services/gateway-api/service/src",
);
const APP_ENTRY = resolve(GATEWAY_SRC_ROOT, "app.js");
const ROUTES_DIR = resolve(GATEWAY_SRC_ROOT, "routes");

function resolveLocalImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return "";
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    resolve(base, "index.js"),
    resolve(base, "index.mjs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function extractImports(content, fromFile) {
  const imports = [];
  const regex = /import\s+(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["'];?/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const resolved = resolveLocalImport(fromFile, match[1]);
    if (resolved) {
      imports.push(resolved);
    }
  }
  const reExportRegex = /export\s+(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["'];?/g;
  while ((match = reExportRegex.exec(content)) !== null) {
    const resolved = resolveLocalImport(fromFile, match[1]);
    if (resolved) {
      imports.push(resolved);
    }
  }

  // Route registrar modules can include literal arrays consumed by dynamic import().
  const sideEffectArrayMatch = content.match(/SIDE_EFFECT_ROUTE_MODULES\s*=\s*\[([\s\S]*?)\];/m);
  if (sideEffectArrayMatch) {
    const literalRegex = /["']([^"']+)["']/g;
    let literalMatch;
    while ((literalMatch = literalRegex.exec(sideEffectArrayMatch[1])) !== null) {
      const resolved = resolveLocalImport(fromFile, literalMatch[1]);
      if (resolved) {
        imports.push(resolved);
      }
    }
  }

  return [...new Set(imports)];
}

function extractImportSymbolMap(content, fromFile) {
  const map = new Map();
  const regex = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];?/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const resolved = resolveLocalImport(fromFile, match[2]);
    if (!resolved) continue;
    const symbols = match[1]
      .split(",")
      .map((value) => value.trim())
      .map((value) => value.split(/\s+as\s+/)[1] ?? value.split(/\s+as\s+/)[0]);
    for (const symbol of symbols) {
      if (symbol) {
        map.set(symbol, resolved);
      }
    }
  }
  return map;
}

function detectRouteIds(content) {
  const routeIds = new Set();
  const regex =
    /(?:\bapp\b|\bserver\.app\b|\bserver\b|\bhealthRoutes\b)\.(get|post|put|patch|delete|options)\(\s*["'`]([^"'`]+)["'`]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    routeIds.add(`${match[1].toUpperCase()} ${match[2]}`);
  }
  return [...routeIds];
}

function detectServiceEdges(content, filePath) {
  const edges = new Map();
  const addEdge = (service, mode, evidence) => {
    const key = `${service}:${mode}`;
    if (edges.has(key)) return;
    edges.set(key, { service, mode, evidence });
  };

  if (/(clients\??\.\s*contextWall|getContextWallClient\(|watchApprovalQueue\(|orchestrateChat\(|evaluateStep\()/m.test(content)) {
    addEdge("context-wall", "direct", "context-wall client usage");
  }
  if (/(clients\??\.\s*auditWriter|appendEvent\(|QueryEvents\()/m.test(content)) {
    addEdge("audit-writer", "direct", "audit-writer client usage");
  }
  if (/(clients\??\.\s*secretsBroker|getGrpcClients\(\)\?\.\s*secretsBroker)/m.test(content)) {
    addEdge("secrets-broker", "direct", "secrets-broker client usage");
  }
  if (/(proxyBusinessApiRequest|\/api\/business\/|business-api-client)/m.test(content)) {
    addEdge("business-api", "direct", "business-api proxy usage");
  }
  if (/(clients\??\.\s*modelRouter|grpcUnary\(\s*clients\.modelRouter)/m.test(content)) {
    addEdge("model-router", "direct", "model-router reference");
  }
  if (/(executeToolWithPolicy|forwardJsonRpcWithPolicy)/m.test(content)) {
    addEdge("context-wall", "direct", "policy-plane mediation calls");
    addEdge("mcp-proxy", "mediated", "context-wall forwards MCP JSON-RPC");
    addEdge("tool-runner", "mediated", "context-wall tool execution mediation");
    addEdge("cyber-proxy", "mediated", "context-wall cyber guard mediation");
  }

  if (filePath.endsWith("/middleware.js")) {
    addEdge("audit-writer", "direct", "gateway API request auditing pipeline");
  }

  return [...edges.values()];
}

function listActiveRouteEntryFiles() {
  const appContent = readFileSync(APP_ENTRY, "utf8");
  const symbolMap = extractImportSymbolMap(appContent, APP_ENTRY);
  const entries = new Set();

  const sideEffectRegex = /import\s*["']([^"']+)["'];?/g;
  let sideEffectMatch;
  while ((sideEffectMatch = sideEffectRegex.exec(appContent)) !== null) {
    const spec = sideEffectMatch[1];
    const resolved = resolveLocalImport(APP_ENTRY, spec);
    if (!resolved) continue;
    if (resolved.startsWith(ROUTES_DIR) || resolved.endsWith("/middleware.js")) {
      entries.add(resolved);
    }
  }

  const callRegex = /\b([A-Za-z0-9_]+)\(app\);/g;
  let callMatch;
  while ((callMatch = callRegex.exec(appContent)) !== null) {
    const filePath = symbolMap.get(callMatch[1]);
    if (filePath) {
      entries.add(filePath);
    }
  }

  const routeRefRegex = /app\.route\(\s*["'`][^"'`]+["'`]\s*,\s*([A-Za-z0-9_]+)\s*\)/g;
  let routeRefMatch;
  while ((routeRefMatch = routeRefRegex.exec(appContent)) !== null) {
    const filePath = symbolMap.get(routeRefMatch[1]);
    if (filePath) {
      entries.add(filePath);
    }
  }

  return [...entries].sort((a, b) => a.localeCompare(b));
}

function buildModuleGraph(entryFiles) {
  const modules = new Map();
  const queue = [...entryFiles];
  while (queue.length > 0) {
    const filePath = queue.shift();
    if (!filePath.startsWith(GATEWAY_SRC_ROOT) || modules.has(filePath) || !existsSync(filePath)) {
      continue;
    }
    const content = readFileSync(filePath, "utf8");
    const imports = extractImports(content, filePath).filter((candidate) =>
      candidate.startsWith(GATEWAY_SRC_ROOT),
    );
    const routeIds = detectRouteIds(content);
    const services = detectServiceEdges(content, filePath);
    modules.set(filePath, { filePath, imports, routeIds, services });
    for (const dependency of imports) {
      if (!modules.has(dependency)) {
        queue.push(dependency);
      }
    }
  }
  return modules;
}

function collectReachableModules(graph, rootFile) {
  const visited = new Set();
  const stack = [rootFile];
  while (stack.length > 0) {
    const filePath = stack.pop();
    if (visited.has(filePath)) continue;
    visited.add(filePath);
    const node = graph.get(filePath);
    if (!node) continue;
    for (const dep of node.imports) {
      if (!visited.has(dep)) {
        stack.push(dep);
      }
    }
  }
  return [...visited];
}

export function buildStaticCallgraph() {
  const activeEntryFiles = listActiveRouteEntryFiles();
  const graph = buildModuleGraph(activeEntryFiles);

  const routeRecords = [];
  const serviceCoverage = new Map();
  const roots = [];

  for (const rootFile of activeEntryFiles) {
    const reachable = collectReachableModules(graph, rootFile);
    const rootRouteIds = new Set();
    const rootEdges = new Map();
    for (const filePath of reachable) {
      const node = graph.get(filePath);
      if (!node) continue;
      for (const routeId of node.routeIds) {
        rootRouteIds.add(routeId);
      }
      for (const edge of node.services) {
        rootEdges.set(`${edge.service}:${edge.mode}`, edge);
      }
    }

    const routeIds = [...rootRouteIds];
    const edges = [...rootEdges.values()];
    const normalizedRouteIds =
      routeIds.length > 0 ? routeIds : edges.length > 0 ? [`INTERNAL ${relative(ROOT_DIR, rootFile)}`] : [];

    roots.push({
      rootFile: relative(ROOT_DIR, rootFile),
      reachableModules: reachable.map((filePath) => relative(ROOT_DIR, filePath)).sort(),
      routeIds: normalizedRouteIds.sort(),
      services: edges,
    });

    for (const routeId of normalizedRouteIds) {
      routeRecords.push({
        routeId,
        rootFile: relative(ROOT_DIR, rootFile),
        services: edges,
      });
    }

    for (const edge of edges) {
      const current = serviceCoverage.get(edge.service) ?? {
        service: edge.service,
        routeIds: new Set(),
        roots: new Set(),
        modes: new Set(),
      };
      for (const routeId of normalizedRouteIds) {
        current.routeIds.add(routeId);
      }
      current.roots.add(relative(ROOT_DIR, rootFile));
      current.modes.add(edge.mode);
      serviceCoverage.set(edge.service, current);
    }
  }

  const knownRouteFiles = new Set([...graph.keys()].map((entry) => resolve(entry)));
  const legacyCandidates = [];
  if (existsSync(ROUTES_DIR)) {
    const list = [];
    const stack = [ROUTES_DIR];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const item of readdirSync(current, { withFileTypes: true })) {
        const full = resolve(current, item.name);
        if (item.isDirectory()) {
          stack.push(full);
        } else if (item.isFile() && full.endsWith(".js")) {
          list.push(full);
        }
      }
    }
    for (const filePath of list) {
      if (!knownRouteFiles.has(resolve(filePath)) && !activeEntryFiles.includes(resolve(filePath))) {
        legacyCandidates.push(relative(ROOT_DIR, filePath));
      }
    }
  }

  return {
    ok: true,
    generatedAt: nowIso(),
    appEntrypoint: relative(ROOT_DIR, APP_ENTRY),
    activeRouteEntryFiles: activeEntryFiles.map((filePath) => relative(ROOT_DIR, filePath)),
    activeModuleCount: graph.size,
    roots,
    routes: routeRecords.sort((a, b) => a.routeId.localeCompare(b.routeId)),
    serviceCoverage: [...serviceCoverage.values()]
      .map((entry) => ({
        service: entry.service,
        routeCount: entry.routeIds.size,
        routeIds: [...entry.routeIds].sort(),
        roots: [...entry.roots].sort(),
        modes: [...entry.modes].sort(),
      }))
      .sort((a, b) => a.service.localeCompare(b.service)),
    ignoredLegacyCandidates: legacyCandidates.sort(),
  };
}

export function runStaticCallgraphScript() {
  const args = parseArgs();
  const outputFile = args.get("output") ?? DEFAULT_CALLGRAPH_FILE;
  const callgraph = buildStaticCallgraph();
  writeJson(resolve(ROOT_DIR, outputFile), callgraph);
  process.stdout.write(
    `[service-callgraph-static] wrote ${outputFile} (${callgraph.routes.length} routes)\n`,
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runStaticCallgraphScript();
}
