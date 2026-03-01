const MAPLE_LOG_LEVEL_ORDER = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4,
};
if (!process.env.MAPLE_LOG_LEVEL) {
    throw new Error("Missing required environment variable: MAPLE_LOG_LEVEL");
}
const mapleLogLevelRaw = process.env.MAPLE_LOG_LEVEL.trim().toLowerCase();
if (!(mapleLogLevelRaw in MAPLE_LOG_LEVEL_ORDER)) {
    throw new Error(`Invalid MAPLE_LOG_LEVEL: "${mapleLogLevelRaw}" (must be error/warn/info/debug/trace)`);
}
export const mapleLogLevel = mapleLogLevelRaw;
if (!process.env.MAPLE_LOG_INCLUDE_BODIES) {
    throw new Error("Missing required environment variable: MAPLE_LOG_INCLUDE_BODIES");
}
export const mapleLogIncludeBodies = process.env.MAPLE_LOG_INCLUDE_BODIES.trim().toLowerCase() === "true" ||
    process.env.MAPLE_LOG_INCLUDE_BODIES.trim().toLowerCase() === "1";
if (!process.env.MAPLE_LOG_REQUESTS) {
    throw new Error("Missing required environment variable: MAPLE_LOG_REQUESTS");
}
export const mapleLogRequestsEnabled = process.env.MAPLE_LOG_REQUESTS.trim().toLowerCase() !== "false" &&
    process.env.MAPLE_LOG_REQUESTS.trim().toLowerCase() !== "0";
if (!process.env.MAPLE_LOG_BODY_MAX_CHARS) {
    throw new Error("Missing required environment variable: MAPLE_LOG_BODY_MAX_CHARS");
}
const mapleLogBodyMaxCharsRaw = Number.parseInt(process.env.MAPLE_LOG_BODY_MAX_CHARS.trim(), 10);
if (!Number.isFinite(mapleLogBodyMaxCharsRaw) || mapleLogBodyMaxCharsRaw < 256 || mapleLogBodyMaxCharsRaw > 40000) {
    throw new Error(`Invalid MAPLE_LOG_BODY_MAX_CHARS: must be 256-40000`);
}
export const mapleLogBodyMaxChars = mapleLogBodyMaxCharsRaw;
export function shouldLogLevel(level) {
    return MAPLE_LOG_LEVEL_ORDER[level] <= MAPLE_LOG_LEVEL_ORDER[mapleLogLevel];
}
export function shouldLogHttpRequestPath(path) {
    if (path.startsWith("/api/")) {
        return true;
    }
    if (path === "/mcp" || path.startsWith("/mcp/")) {
        return true;
    }
    if (path === "/sse" || path.startsWith("/sse/")) {
        return true;
    }
    if (path === "/judge" || path.startsWith("/judge") || path === "/landing" || path === "/") {
        return true;
    }
    return false;
}
//# sourceMappingURL=logging-config.js.map