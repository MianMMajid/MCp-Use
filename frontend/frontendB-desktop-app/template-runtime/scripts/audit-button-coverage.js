#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const TEMPLATE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REPO_ROOT = path.resolve(TEMPLATE_ROOT, "../../..");
const SRC_ROOT = path.join(TEMPLATE_ROOT, "src");
const DOCS_ROOT = path.join(REPO_ROOT, "docs");
const MD_PATH = path.join(DOCS_ROOT, "frontendB-button-api-db-coverage.md");
const JSON_PATH = path.join(DOCS_ROOT, "frontendB-button-api-db-coverage.json");
const BACKEND_ROUTES_ROOT = path.join(
  REPO_ROOT,
  "backend/backendB-core-services/gateway-api/service/src/routes",
);
const FAKE_HANDLERS_PATH = path.join(SRC_ROOT, "lib/fake-mode/handlers.js");

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const CLICK_REGEX = /(on:click=|onclick=|type="submit"|type='submit'|role="button"|role='button')/;

function walkFiles(rootDir) {
  const out = [];
  const queue = [rootDir];
  while (queue.length) {
    const current = queue.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.endsWith(".svelte") || entry.name.endsWith(".js") || entry.name.endsWith(".ts")) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

function walkRouteFiles(rootDir) {
  const out = [];
  const queue = [rootDir];
  while (queue.length) {
    const current = queue.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
      out.push(full);
    }
  }
  return out.sort();
}

function extractFunctionBodies(sourceText) {
  const functions = new Map();
  const declarations = [
    /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/g,
    /(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g,
  ];

  for (const regex of declarations) {
    let match;
    while ((match = regex.exec(sourceText))) {
      const fnName = match[1];
      const braceStart = sourceText.indexOf("{", match.index + match[0].length - 1);
      if (braceStart < 0) continue;
      const end = findMatchingBrace(sourceText, braceStart);
      if (end < 0) continue;
      functions.set(fnName, sourceText.slice(braceStart, end + 1));
    }
  }

  return functions;
}

function findMatchingBrace(text, startIndex) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;
  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (!inDouble && !inTemplate && ch === "'") inSingle = !inSingle;
    else if (!inSingle && !inTemplate && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === "`") inTemplate = !inTemplate;
    if (inSingle || inDouble || inTemplate) continue;
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractEndpointsFromText(text) {
  const found = [];
  const callRegexes = [
    { regex: /(loadJson)\((`[^`]+`|'[^']+'|"[^"]+")\)/g, method: "GET" },
    { regex: /(postJson)\((`[^`]+`|'[^']+'|"[^"]+")/g, method: "POST" },
    { regex: /(patchJson)\((`[^`]+`|'[^']+'|"[^"]+")/g, method: "PATCH" },
    { regex: /(deleteJson)\((`[^`]+`|'[^']+'|"[^"]+")/g, method: "DELETE" },
    { regex: /(new\s+EventSource)\((`[^`]+`|'[^']+'|"[^"]+")\)/g, method: "GET(SSE)" },
  ];

  for (const entry of callRegexes) {
    let match;
    while ((match = entry.regex.exec(text))) {
      const raw = trimQuotes(match[2]);
      if (!raw.includes("/api/") && !raw.includes("/admin/api/")) continue;
      found.push({ endpoint: normalizeEndpoint(raw), method: entry.method });
    }
  }

  let literalMatch;
  const endpointLiteralRegex = /\/(?:admin\/)?api\/[A-Za-z0-9_./:${}?=&-]+/g;
  while ((literalMatch = endpointLiteralRegex.exec(text))) {
    const rawLiteral = literalMatch[0];
    if (rawLiteral.includes("${")) continue;
    if (rawLiteral.startsWith("/api/${") || rawLiteral.startsWith("/admin/api/${")) continue;
    const endpoint = normalizeEndpoint(rawLiteral);
    if (!endpoint || endpoint.endsWith("/")) continue;
    if (!endpoint) continue;
    if (!found.some((item) => item.endpoint === endpoint)) {
      found.push({ endpoint, method: "UNKNOWN" });
    }
  }

  return dedupeEndpointMethods(found);
}

function dedupeEndpointMethods(items) {
  const map = new Map();
  for (const item of items) {
    const key = `${item.endpoint}::${item.method}`;
    map.set(key, item);
  }
  return [...map.values()];
}

function trimQuotes(value) {
  if (!value) return value;
  return value.replace(/^['"`]/, "").replace(/['"`]$/, "");
}

function normalizeEndpoint(endpoint) {
  if (!endpoint) return "";
  let normalized = endpoint.trim();
  normalized = normalized.replace(/\$\{[^}]+\}/g, ":param");
  normalized = normalized.replace(/[)"'`}]+$/g, "");
  normalized = normalized.replace(/\?.*$/, "");
  normalized = normalized.replace(/\/{2,}/g, "/");
  return normalized;
}

function lineNumberAt(content, charIndex) {
  let line = 1;
  for (let i = 0; i < charIndex; i += 1) {
    if (content[i] === "\n") line += 1;
  }
  return line;
}

function extractControlsFromContent(content) {
  const controls = [];
  const seen = new Set();

  const pairedRegex =
    /<([A-Za-z][\w:-]*)\b[^>]*?(?:on:click=|onclick=|type=(?:"submit"|'submit')|role=(?:"button"|'button'))[^>]*>[\s\S]*?<\/\1>/g;
  let match;
  while ((match = pairedRegex.exec(content))) {
    const start = match.index;
    if (seen.has(start)) continue;
    seen.add(start);
    controls.push({
      snippet: match[0],
      start,
      line: lineNumberAt(content, start),
    });
  }

  const singleRegex =
    /<([A-Za-z][\w:-]*)\b[^>]*?(?:on:click=|onclick=|type=(?:"submit"|'submit')|role=(?:"button"|'button'))[^>]*\/?>/g;
  while ((match = singleRegex.exec(content))) {
    const start = match.index;
    if (seen.has(start)) continue;
    seen.add(start);
    controls.push({
      snippet: match[0],
      start,
      line: lineNumberAt(content, start),
    });
  }

  controls.sort((a, b) => a.start - b.start);
  return controls;
}

function normalizeTextLabel(text) {
  return text.replace(/\s+/g, " ").trim();
}

function extractLabelFromExpression(snippet) {
  const expressionMatch = snippet.match(/\{([^{}]*\?[^{}]*:[^{}]*)\}/);
  if (!expressionMatch) return "";
  const expression = expressionMatch[1];
  const quoted = [...expression.matchAll(/'([^']+)'|"([^"]+)"/g)]
    .map((m) => m[1] || m[2])
    .filter(Boolean);
  if (!quoted.length) return "";
  return [...new Set(quoted)].join(" / ");
}

function labelFromSnippet(snippet) {
  const aria = snippet.match(/aria-label=["']([^"']+)["']/i);
  if (aria) return normalizeTextLabel(aria[1]);
  const title = snippet.match(/title=["']([^"']+)["']/i);
  if (title) return normalizeTextLabel(title[1]);

  const contentMatch = snippet.match(/^[^>]*>([\s\S]*?)<\/[A-Za-z][\w:-]*>\s*$/);
  if (contentMatch) {
    const inner = contentMatch[1]
      .replace(/<[^>]*>/g, " ")
      .replace(/\{[^}]*\}/g, " ")
      .replace(/&nbsp;/g, " ");
    const text = normalizeTextLabel(inner);
    if (text) return text;
  }

  const expressionLabel = extractLabelFromExpression(snippet);
  if (expressionLabel) return expressionLabel;

  if (snippet.includes("menu-btn")) return "More Actions";
  if (snippet.includes("pill")) return "Pill Action";
  return "Clickable Control";
}

function humanizeIdentifier(identifier) {
  if (!identifier) return "";
  const cleaned = identifier
    .replace(/^\(\)\s*=>\s*/, "")
    .replace(/^\{|\}$/g, "")
    .trim();
  const fnMatch =
    cleaned.match(/^([A-Za-z_][A-Za-z0-9_]*)$/) ||
    cleaned.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(/) ||
    cleaned.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  if (!fnMatch) return "";
  let token = fnMatch[1];
  token = token.replace(/^(on|handle|click|do)/, "");
  if (!token) return "";
  const spaced = token
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!spaced) return "";
  return spaced
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferHandler(snippet) {
  const clickMatch = snippet.match(/on:click=\{([^}]+)\}/);
  if (clickMatch) return clickMatch[1].trim();
  const onClickMatch = snippet.match(/onclick=\{([^}]+)\}/);
  if (onClickMatch) return onClickMatch[1].trim();
  if (snippet.includes('type="submit"') || snippet.includes("type='submit'")) return "FORM_SUBMIT";
  return "UNKNOWN_HANDLER";
}

function buildControlInventory(files) {
  const controls = [];
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const relPath = path.relative(REPO_ROOT, filePath);
    const functions = extractFunctionBodies(content);
    const controlSnippets = extractControlsFromContent(content);
    for (const control of controlSnippets) {
      const snippet = control.snippet;
      if (!CLICK_REGEX.test(snippet)) continue;
      const handler = inferHandler(snippet);
      let label = labelFromSnippet(snippet);
      if (label === "Pill Action" || label === "Clickable Control") {
        const derived = humanizeIdentifier(handler);
        if (derived) label = derived;
      }
      const endpoints = resolveControlEndpoints({
        handler,
        line: snippet,
        content,
        functions,
      });
      controls.push({
        filePath: relPath,
        line: control.line,
        routeContext: routeContextFromPath(relPath),
        controlLabel: label || "Clickable Control",
        handler,
        sourceLine: normalizeTextLabel(snippet.slice(0, 220)),
        endpoints,
      });
    }
  }
  controls.sort((a, b) => {
    const p = a.filePath.localeCompare(b.filePath);
    if (p !== 0) return p;
    return a.line - b.line;
  });
  return controls;
}

function routeContextFromPath(relPath) {
  if (relPath.includes("/src/routes/")) {
    const routePart = relPath.split("/src/routes/")[1];
    return `/${routePart.replace("/+page.svelte", "").replace("/+layout.svelte", "").replace("/+page.js", "")}`;
  }
  return "component";
}

function resolveControlEndpoints({ handler, line, content, functions }) {
  const endpoints = [];
  const addAll = (items) => {
    for (const item of items) endpoints.push(item);
  };

  addAll(extractEndpointsFromText(line));

  const referencedFns = new Set();
  if (handler === "FORM_SUBMIT") {
    const submitRegex = /on:submit(?:\|preventDefault)?=\{([^}]+)\}/g;
    let match;
    while ((match = submitRegex.exec(content))) {
      referencedFns.add(match[1].trim());
    }
  } else {
    const directIdentifier = handler.match(/^[A-Za-z_][A-Za-z0-9_]*$/);
    if (directIdentifier) referencedFns.add(directIdentifier[0]);
    const invokeMatch = handler.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g) || [];
    for (const call of invokeMatch) referencedFns.add(call.replace(/\s*\($/, ""));
  }

  const visited = new Set();
  const visitFn = (fnName, depth = 0) => {
    if (!fnName || visited.has(fnName) || depth > 4) return;
    visited.add(fnName);
    const body = functions.get(fnName);
    if (!body) return;
    addAll(extractEndpointsFromText(body));
    const localCalls = body.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g) || [];
    for (const local of localCalls) {
      const child = local.replace(/\s*\($/, "");
      if (functions.has(child)) visitFn(child, depth + 1);
    }
  };

  for (const fnName of referencedFns) visitFn(fnName);
  const deduped = dedupeEndpointMethods(endpoints);
  return deduped.filter((entry) => entry.endpoint.startsWith("/api/") || entry.endpoint.startsWith("/admin/api/"));
}

function loadBackendRouteIndex() {
  const routeFiles = walkRouteFiles(BACKEND_ROUTES_ROOT);
  return routeFiles.map((file) => {
    const text = fs.readFileSync(file, "utf8");
    const declaredPaths = [];
    const routeDeclRegex = /(?:app|server)\.(?:get|post|patch|put|delete)\(\s*["'](\/(?:admin\/)?api\/[^"']+)["']/g;
    let match;
    while ((match = routeDeclRegex.exec(text))) {
      declaredPaths.push(normalizeEndpoint(match[1]).replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ":param"));
    }
    return {
    file,
    relPath: path.relative(REPO_ROOT, file),
    text,
    declaredPaths,
  };
  });
}

function findBackendRouteEvidence(endpoint, routeIndex) {
  const clean = normalizeEndpoint(endpoint);
  if (!clean.startsWith("/api/") && !clean.startsWith("/admin/api/")) return [];
  const canonical = clean.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ":param");
  return routeIndex.filter((route) => route.declaredPaths.includes(canonical));
}

function classifyDbStatus(endpoints, routeEvidence) {
  if (!endpoints.length) return { dbStatus: "DB_NONE_UI_ONLY", verdict: "COVERED_UI_ONLY" };

  let hasMissing = false;
  let hasUnknown = false;
  let hasConfirmed = false;
  let hasUnconfirmed = false;

  for (const endpoint of endpoints) {
    const evidence = routeEvidence[endpoint.endpoint] || [];
    if (!evidence.length) {
      hasMissing = true;
      continue;
    }
    const fullText = evidence.map((item) => item.text).join("\n");
    if (/(database\.[A-Za-z_]|stateDb\.[A-Za-z_]|traceStore\.[A-Za-z_]|sharedTraceStore\.[A-Za-z_]|upsert|insert|delete|update|load[A-Z]\w+|query\()/m.test(fullText)) {
      hasConfirmed = true;
      continue;
    }
    if (/(inMemory|cache-only|mock|stub|new Map\(|Map\(\))/m.test(fullText)) {
      hasUnconfirmed = true;
      continue;
    }
    hasUnknown = true;
  }

  if (hasMissing) return { dbStatus: "API_MISSING", verdict: "GAP" };
  if (hasUnknown) return { dbStatus: "API_PRESENT_DB_UNKNOWN", verdict: "PARTIAL" };
  if (hasUnconfirmed) return { dbStatus: "DB_UNCONFIRMED", verdict: "PARTIAL" };
  if (hasConfirmed) return { dbStatus: "DB_CONFIRMED", verdict: "COVERED" };
  return { dbStatus: "API_PRESENT_DB_UNKNOWN", verdict: "PARTIAL" };
}

function fakeModeCoverage(endpoint, fakeHandlersText) {
  const clean = normalizeEndpoint(endpoint).replace(/:param/g, "");
  return fakeHandlersText.includes(clean);
}

function buildRows(controls, routeIndex, fakeHandlersText) {
  let idCounter = 1;
  const rows = [];
  for (const control of controls) {
    const endpointList = control.endpoints.map((entry) => entry.endpoint);
    const routeEvidenceByEndpoint = {};
    for (const entry of control.endpoints) {
      routeEvidenceByEndpoint[entry.endpoint] = findBackendRouteEvidence(entry.endpoint, routeIndex);
    }
    const classification = classifyDbStatus(control.endpoints, routeEvidenceByEndpoint);
    const backendEvidence = control.endpoints.length
      ? control.endpoints
          .map((entry) => {
            const files = (routeEvidenceByEndpoint[entry.endpoint] || [])
              .slice(0, 3)
              .map((item) => item.relPath)
              .join("; ");
            return `${entry.endpoint} -> ${files || "NONE"}`;
          })
          .join(" | ")
      : "No API required";

    const fakeCoverage = control.endpoints.length
      ? control.endpoints.every((entry) => fakeModeCoverage(entry.endpoint, fakeHandlersText))
      : true;

    rows.push({
      controlId: `B${String(idCounter).padStart(4, "0")}`,
      controlLabel: control.controlLabel,
      pageComponent: `${control.filePath}:${control.line}`,
      routeContext: control.routeContext,
      handler: control.handler,
      apiEndpoints: endpointList.length ? endpointList.join(", ") : "No API required",
      methods: control.endpoints.length ? control.endpoints.map((entry) => entry.method).join(", ") : "N/A",
      backendRouteEvidence: backendEvidence,
      dbStatus: classification.dbStatus,
      coverageVerdict: classification.verdict,
      fakeModeCovered: fakeCoverage ? "YES" : "NO",
      gapFixNeeded: gapMessage(classification.dbStatus),
    });
    idCounter += 1;
  }
  return rows;
}

function gapMessage(dbStatus) {
  if (dbStatus === "DB_NONE_UI_ONLY") return "None. UI-only control.";
  if (dbStatus === "DB_CONFIRMED") return "None.";
  if (dbStatus === "DB_UNCONFIRMED") return "Confirm persistence path or add explicit DB-backed store calls.";
  if (dbStatus === "API_PRESENT_DB_UNKNOWN") return "Trace endpoint to concrete DB/store usage and document it.";
  if (dbStatus === "API_MISSING") return "Implement endpoint in gateway routes and wire persistence.";
  return "Review required.";
}

function buildSummary(rows, generatedAt) {
  const summary = {
    generatedAt,
    totalControls: rows.length,
    apiBacked: rows.filter((row) => row.apiEndpoints !== "No API required").length,
    uiOnly: rows.filter((row) => row.dbStatus === "DB_NONE_UI_ONLY").length,
    dbConfirmed: rows.filter((row) => row.dbStatus === "DB_CONFIRMED").length,
    dbUnconfirmed: rows.filter((row) => row.dbStatus === "DB_UNCONFIRMED").length,
    apiMissing: rows.filter((row) => row.dbStatus === "API_MISSING").length,
    apiPresentDbUnknown: rows.filter((row) => row.dbStatus === "API_PRESENT_DB_UNKNOWN").length,
    fakeModeNotCovered: rows.filter((row) => row.fakeModeCovered === "NO").length,
  };
  return summary;
}

function toMarkdown(summary, rows) {
  const lines = [];
  lines.push("# Frontend B Button-to-API/DB Coverage Audit");
  lines.push("");
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Total controls: ${summary.totalControls}`);
  lines.push(`- API-backed controls: ${summary.apiBacked}`);
  lines.push(`- UI-only controls: ${summary.uiOnly}`);
  lines.push(`- DB_CONFIRMED: ${summary.dbConfirmed}`);
  lines.push(`- DB_UNCONFIRMED: ${summary.dbUnconfirmed}`);
  lines.push(`- API_PRESENT_DB_UNKNOWN: ${summary.apiPresentDbUnknown}`);
  lines.push(`- API_MISSING: ${summary.apiMissing}`);
  lines.push(`- Fake-mode not covered: ${summary.fakeModeNotCovered}`);
  lines.push("");
  lines.push("## Exhaustive Matrix");
  lines.push("");
  lines.push(
    "| Control ID | UI Control (Label/Icon) | Page/Component | Handler | API Endpoint(s) | Method(s) | Backend Route Evidence | DB Status | Coverage Verdict | Gap / Fix Needed |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows) {
    const values = [
      row.controlId,
      sanitizeMd(row.controlLabel),
      sanitizeMd(row.pageComponent),
      sanitizeMd(row.handler),
      sanitizeMd(row.apiEndpoints),
      sanitizeMd(row.methods),
      sanitizeMd(row.backendRouteEvidence),
      row.dbStatus,
      row.coverageVerdict,
      sanitizeMd(row.gapFixNeeded),
    ];
    lines.push(`| ${values.join(" | ")} |`);
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- DB status uses strict static evidence from backend route/service code paths.");
  lines.push("- Fake-mode support is tracked in JSON output via `fakeModeCovered`.");
  return `${lines.join("\n")}\n`;
}

function sanitizeMd(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, "<br/>");
}

function stableStringify(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  ensureDir(DOCS_ROOT);

  let generatedAt = new Date().toISOString();
  if (checkOnly && fs.existsSync(JSON_PATH)) {
    try {
      const current = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
      generatedAt = current?.summary?.generatedAt || current?.metadata?.generatedAt || generatedAt;
    } catch {
      // keep default timestamp if existing file is invalid JSON
    }
  }

  const sourceFiles = walkFiles(SRC_ROOT);
  const controls = buildControlInventory(sourceFiles);
  const routeIndex = loadBackendRouteIndex();
  const fakeHandlersText = fs.existsSync(FAKE_HANDLERS_PATH)
    ? fs.readFileSync(FAKE_HANDLERS_PATH, "utf8")
    : "";
  const rows = buildRows(controls, routeIndex, fakeHandlersText);
  const summary = buildSummary(rows, generatedAt);

  const jsonPayload = {
    metadata: {
      scope: "frontend/frontendB-desktop-app/template-runtime/src/**",
      strictDbEvidence: true,
      includesAllClickableControls: true,
      generatedAt: summary.generatedAt,
    },
    summary,
    rows,
  };

  const md = toMarkdown(summary, rows);
  const json = stableStringify(jsonPayload);

  if (checkOnly) {
    const currentMd = fs.existsSync(MD_PATH) ? fs.readFileSync(MD_PATH, "utf8") : "";
    const currentJson = fs.existsSync(JSON_PATH) ? fs.readFileSync(JSON_PATH, "utf8") : "";
    if (currentMd !== md || currentJson !== json) {
      console.error("Button coverage audit artifacts are out of date. Run: npm run audit:button-coverage");
      process.exit(1);
    }
    console.log("Button coverage audit artifacts are up to date.");
    return;
  }

  fs.writeFileSync(MD_PATH, md);
  fs.writeFileSync(JSON_PATH, json);
  console.log(`Wrote ${path.relative(REPO_ROOT, MD_PATH)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, JSON_PATH)}`);
  console.log(`Controls: ${summary.totalControls}`);
}

main();
