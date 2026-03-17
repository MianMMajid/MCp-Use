import { posix as pathPosix } from "node:path";

const DEFAULT_GENERATED_PATTERNS = [
  /(^|\/)(dist|build|target|coverage|tmp|temp|\.tmp|\.cache|\.turbo|\.vite|\.next|node_modules)(\/|$)/i,
  /(^|\/)\.maple-security(\/|$)/i,
  /(^|\/)(out|artifacts?|reports?)(\/|$)/i,
];

const DEFAULT_SENSITIVE_PATTERNS = [
  /(^|\/)\.env(\.|$|\/)/i,
  /(^|\/)\.ssh(\/|$)/i,
  /(^|\/)(id_rsa|id_ed25519|id_ecdsa)$/i,
  /(^|\/)\.aws(\/|$)/i,
  /(^|\/)\.kube(\/|$)/i,
  /(^|\/)\.docker(\/|$)/i,
  /(^|\/)(credentials|secrets?|tokens?)(\/|$|\.)/i,
];

const DEFAULT_PROTECTED_ROOTS = [
  "/",
  "/etc",
  "/root",
  "/proc",
  "/sys",
  "/dev",
  "/var/run",
];

const DEFAULT_SOURCE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".md",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const PATH_KEYS = new Set([
  "path",
  "paths",
  "file",
  "files",
  "filepath",
  "filePath",
  "target",
  "targets",
  "destination",
  "dest",
  "output",
  "outputPath",
  "from",
  "to",
]);

const DELETE_TOOL_PATTERN = /(delete|remove|unlink|cleanup|clean|purge|wipe)/i;
const MOVE_TOOL_PATTERN = /(move|rename)/i;
const WRITE_TOOL_PATTERN = /(write|overwrite|update|save|edit|patch)/i;

function asString(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function normalizePath(value, workspaceRoot = "") {
  const raw = asString(value);
  if (!raw) return "";
  const normalized = raw.replace(/\\/g, "/");
  if (normalized.includes("*") || normalized.includes("?")) {
    return normalized;
  }
  if (normalized.startsWith("/")) {
    return pathPosix.normalize(normalized);
  }
  const base = workspaceRoot ? workspaceRoot.replace(/\\/g, "/") : "";
  if (!base) return pathPosix.normalize(`/${normalized}`).replace(/^\/+/, "");
  return pathPosix.normalize(pathPosix.join(base, normalized));
}

function isWithinRoot(targetPath, rootPath) {
  if (!targetPath || !rootPath) return false;
  const normalizedTarget = pathPosix.normalize(targetPath);
  const normalizedRoot = pathPosix.normalize(rootPath);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
}

function relativeToContainingRoot(targetPath, roots = []) {
  const normalizedTarget = pathPosix.normalize(asString(targetPath));
  const matchedRoot = asArray(roots)
    .map((value) => normalizePath(value))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find((root) => isWithinRoot(normalizedTarget, root));
  if (!matchedRoot) return normalizedTarget;
  const relative = normalizedTarget.slice(matchedRoot.length).replace(/^\/+/, "");
  return relative ? `/${relative}` : "/";
}

function stringMatchesAny(value, matchers = []) {
  const text = asString(value);
  return matchers.some((matcher) => {
    if (!matcher) return false;
    if (matcher instanceof RegExp) return matcher.test(text);
    const normalized = asString(matcher);
    return normalized ? text.includes(normalized) : false;
  });
}

function resolveExtension(pathname = "") {
  const normalized = asString(pathname);
  const index = normalized.lastIndexOf(".");
  return index >= 0 ? normalized.slice(index).toLowerCase() : "";
}

function classifyPath(pathname, options = {}) {
  const allowedRoots = asArray(options.allowedRoots).map((value) => normalizePath(value)).filter(Boolean);
  const protectedRoots = [
    ...DEFAULT_PROTECTED_ROOTS,
    ...asArray(options.protectedRoots).map((value) => normalizePath(value)).filter(Boolean),
  ];
  const generatedPatterns = [...DEFAULT_GENERATED_PATTERNS, ...asArray(options.generatedPathPatterns)];
  const sensitivePatterns = [...DEFAULT_SENSITIVE_PATTERNS, ...asArray(options.sensitivePathPatterns)];
  const agentCreatedPaths = new Set(asArray(options.agentCreatedPaths).map((value) => normalizePath(value)).filter(Boolean));
  const normalizedPath = normalizePath(pathname, allowedRoots[0] ?? "");
  const extension = resolveExtension(normalizedPath);

  if (!normalizedPath) {
    return { path: normalizedPath, classification: "unknown", inAllowedRoot: false, reasons: ["Path missing"] };
  }
  if (normalizedPath.includes("*") || normalizedPath.includes("?")) {
    return { path: normalizedPath, classification: "protected", inAllowedRoot: false, reasons: ["Unresolved globbing is not allowed"] };
  }
  if (normalizedPath.includes("..")) {
    return { path: normalizedPath, classification: "protected", inAllowedRoot: false, reasons: ["Path traversal detected"] };
  }

  const inAllowedRoot = allowedRoots.length === 0 || allowedRoots.some((root) => isWithinRoot(normalizedPath, root));
  const relativePath = relativeToContainingRoot(normalizedPath, allowedRoots);
  if (!inAllowedRoot) {
    return { path: normalizedPath, classification: "protected", inAllowedRoot, reasons: ["Path escapes approved workspace roots"] };
  }

  if (protectedRoots.some((root) => isWithinRoot(normalizedPath, root))) {
    return { path: normalizedPath, classification: "protected", inAllowedRoot, reasons: ["Path is under a protected root"] };
  }
  if (stringMatchesAny(normalizedPath, sensitivePatterns)) {
    return { path: normalizedPath, classification: "sensitive", inAllowedRoot, reasons: ["Path matches sensitive credential/config patterns"] };
  }
  if (agentCreatedPaths.has(normalizedPath)) {
    return { path: normalizedPath, classification: "agent_created", inAllowedRoot, reasons: ["Path is tracked as agent-created output"] };
  }
  if (stringMatchesAny(relativePath, generatedPatterns)) {
    return { path: normalizedPath, classification: "generated", inAllowedRoot, reasons: ["Path matches generated/build-output patterns"] };
  }
  if (DEFAULT_SOURCE_EXTENSIONS.has(extension)) {
    return { path: normalizedPath, classification: "user_authored", inAllowedRoot, reasons: ["Source/config/document path treated as user-authored"] };
  }
  return { path: normalizedPath, classification: "user_authored", inAllowedRoot, reasons: ["Defaulted to user-authored"] };
}

function inferOperationFromTool(toolName, args) {
  const name = asString(toolName).toLowerCase();
  if (DELETE_TOOL_PATTERN.test(name) || args.delete === true || args.remove === true) return "delete";
  if (MOVE_TOOL_PATTERN.test(name)) return "move";
  if (WRITE_TOOL_PATTERN.test(name)) return "overwrite";
  return "";
}

function extractOperationsFromExplicitPlan(input = {}) {
  return asArray(input.operations).map((entry) => {
    const item = asObject(entry);
    return {
      op: asString(item.op, asString(item.type)).toLowerCase(),
      path: asString(item.path),
      from: asString(item.from),
      to: asString(item.to),
      content: item.content,
      recursive: Boolean(item.recursive),
      reason: asString(item.reason),
    };
  }).filter((entry) => entry.op);
}

function extractOperationsFromToolCall(input = {}) {
  const toolName = asString(input.toolName);
  const toolArgs = asObject(input.toolArgs);
  if (Array.isArray(toolArgs.operations)) {
    return extractOperationsFromExplicitPlan({ operations: toolArgs.operations });
  }
  const op = inferOperationFromTool(toolName, toolArgs);
  if (!op) return [];

  if (op === "move") {
    const from = asString(toolArgs.from || toolArgs.path || toolArgs.source);
    const to = asString(toolArgs.to || toolArgs.destination || toolArgs.dest || toolArgs.target);
    if (!from || !to) return [{ op: "move", from, to, ambiguous: true }];
    return [{ op: "move", from, to, recursive: Boolean(toolArgs.recursive), reason: asString(toolArgs.reason) }];
  }

  const directPaths = [];
  for (const key of PATH_KEYS) {
    for (const value of asArray(toolArgs[key])) {
      const normalized = asString(value);
      if (normalized) directPaths.push(normalized);
    }
  }
  const uniquePaths = [...new Set(directPaths)];
  if (uniquePaths.length === 0) {
    return [{ op, path: "", ambiguous: true, recursive: Boolean(toolArgs.recursive), reason: asString(toolArgs.reason) }];
  }
  return uniquePaths.map((path) => ({
    op,
    path,
    recursive: Boolean(toolArgs.recursive),
    content: op === "overwrite" || op === "write" ? toolArgs.content : undefined,
    reason: asString(toolArgs.reason),
  }));
}

function tokenizeShell(command = "") {
  return asString(command)
    .match(/(?:[^\s"]+|"[^"]*")+/g)
    ?.map((entry) => entry.replace(/^"|"$/g, "")) ?? [];
}

function extractOperationsFromShellCommand(command = "") {
  const tokens = tokenizeShell(command);
  if (tokens.length === 0) return [];
  const head = tokens[0]?.toLowerCase();
  if (head === "rm") {
    const recursive = tokens.some((token) => /^-.*r/.test(token) || token === "--recursive");
    const paths = tokens.filter((token, index) => index > 0 && !token.startsWith("-"));
    if (paths.length === 0) return [{ op: "delete", path: "", recursive: true, ambiguous: true }];
    return paths.map((path) => ({ op: "delete", path, recursive }));
  }
  if (head === "mv" && tokens.length >= 3) {
    return [{ op: "move", from: tokens[tokens.length - 2], to: tokens[tokens.length - 1] }];
  }
  if (head === "cp" && tokens.length >= 3) {
    return [{ op: "overwrite", from: tokens[tokens.length - 2], to: tokens[tokens.length - 1] }];
  }
  if (tokens.includes(">") || tokens.some((token) => token.startsWith(">"))) {
    const redirect = tokens.find((token) => token === ">" || token.startsWith(">"));
    const path = redirect === ">" ? tokens[tokens.indexOf(">") + 1] : redirect.slice(1);
    if (path) return [{ op: "overwrite", path }];
  }
  return [];
}

function extractOperations(input = {}) {
  const explicit = extractOperationsFromExplicitPlan(input);
  if (explicit.length > 0) return explicit;
  if (input.command) {
    const shellOps = extractOperationsFromShellCommand(input.command);
    if (shellOps.length > 0) return shellOps;
  }
  return extractOperationsFromToolCall(input);
}

function candidatePathsForOperation(operation) {
  const values = [];
  if (operation.path) values.push(operation.path);
  if (operation.from) values.push(operation.from);
  if (operation.to) values.push(operation.to);
  return [...new Set(values)];
}

function determineLane(plan, options = {}) {
  if (plan.operations.length === 0) {
    return {
      lane: "none",
      message: "No filesystem mutations detected.",
    };
  }

  if (plan.operations.some((operation) => operation.ambiguous)) {
    return {
      lane: "approval_required",
      message: "Mutation intent is ambiguous and requires human review.",
    };
  }

  const protectedPaths = plan.pathClassifications.filter((item) => item.classification === "protected");
  if (protectedPaths.length > 0) {
    return {
      lane: "hard_deny",
      message: protectedPaths[0].reasons[0] || "Protected path targeted.",
    };
  }

  const sensitivePaths = plan.pathClassifications.filter((item) => item.classification === "sensitive");
  if (sensitivePaths.length > 0) {
    return {
      lane: "hard_deny",
      message: sensitivePaths[0].reasons[0] || "Sensitive path targeted.",
    };
  }

  const directMaxPaths = toInt(options.directMaxPaths, 4);
  const promotionMaxPaths = toInt(options.promotionMaxPaths, 200);
  if (plan.candidatePathCount > promotionMaxPaths) {
    return {
      lane: "approval_required",
      message: "Mutation blast radius is too large for unattended promotion.",
    };
  }

  if (plan.recursive || plan.hasMove || plan.hasOverwrite) {
    return {
      lane: "fork_required",
      message: "Recursive, move, and overwrite operations must execute in an isolated fork first.",
    };
  }

  const userAuthored = plan.pathClassifications.filter((item) => item.classification === "user_authored");
  if (userAuthored.length > 0) {
    return {
      lane: "fork_required",
      message: "User-authored files require forked execution and promotion review.",
    };
  }

  const lowRiskOnly = plan.pathClassifications.every((item) =>
    item.classification === "generated" || item.classification === "agent_created"
  );
  if (lowRiskOnly && plan.candidatePathCount <= directMaxPaths) {
    return {
      lane: "direct_allow",
      message: "Low-risk generated or agent-created files can be mutated directly.",
    };
  }

  return {
    lane: "approval_required",
    message: "Mutation requires explicit operator approval.",
  };
}

export function buildFilesystemMutationPlan(input = {}, options = {}) {
  const workspaceRoot = normalizePath(options.workspaceRoot || input.workspaceRoot || asArray(options.allowedRoots)[0] || process.cwd());
  const operations = extractOperations(input).map((operation) => {
    const op = asString(operation.op).toLowerCase();
    const normalized = {
      op,
      path: normalizePath(operation.path, workspaceRoot),
      from: normalizePath(operation.from, workspaceRoot),
      to: normalizePath(operation.to, workspaceRoot),
      recursive: Boolean(operation.recursive),
      reason: asString(operation.reason),
    };
    if (operation.content !== undefined) {
      normalized.content = operation.content;
      normalized.sizeBytes = Buffer.byteLength(typeof operation.content === "string" ? operation.content : JSON.stringify(operation.content), "utf8");
    }
    if (operation.ambiguous) normalized.ambiguous = true;
    return normalized;
  });
  const pathClassifications = operations
    .flatMap((operation) => candidatePathsForOperation(operation).map((path) => classifyPath(path, {
      ...options,
      allowedRoots: asArray(options.allowedRoots).length > 0 ? options.allowedRoots : [workspaceRoot],
    })))
    .filter((item) => item.path);
  const uniquePaths = [...new Set(pathClassifications.map((item) => item.path))];
  const plan = {
    workspaceRoot,
    allowedRoots: asArray(options.allowedRoots).length > 0 ? asArray(options.allowedRoots).map((value) => normalizePath(value)) : [workspaceRoot],
    protectedRoots: [...new Set([...DEFAULT_PROTECTED_ROOTS, ...asArray(options.protectedRoots).map((value) => normalizePath(value)).filter(Boolean)])],
    operations,
    pathClassifications,
    candidatePaths: uniquePaths,
    candidatePathCount: uniquePaths.length,
    recursive: operations.some((operation) => operation.recursive === true),
    hasMove: operations.some((operation) => operation.op === "move"),
    hasOverwrite: operations.some((operation) => operation.op === "overwrite" || operation.op === "write"),
    taskText: asString(input.taskText || input.reason || input.summary),
    sourceSurface: asString(input.sourceSurface, "unknown"),
    sourceType: asString(input.sourceType || input.type, input.command ? "shell" : "tool_call"),
    toolName: asString(input.toolName),
    command: asString(input.command),
    actorUserId: asString(input.actorUserId),
    sessionId: asString(input.sessionId),
    traceId: asString(input.traceId),
    runId: asString(input.runId),
  };
  const lane = determineLane(plan, options);
  return {
    detected: plan.operations.length > 0,
    ...plan,
    lane: lane.lane,
    laneMessage: lane.message,
  };
}

export function summarizeFilesystemMutationPlan(plan = {}) {
  const normalized = asObject(plan);
  const operations = asArray(normalized.operations);
  return {
    lane: asString(normalized.lane, "none"),
    laneMessage: asString(normalized.laneMessage),
    candidatePathCount: toInt(normalized.candidatePathCount, 0),
    operations: operations.map((operation) => ({
      op: asString(operation.op),
      path: asString(operation.path),
      from: asString(operation.from),
      to: asString(operation.to),
      recursive: Boolean(operation.recursive),
    })),
  };
}
