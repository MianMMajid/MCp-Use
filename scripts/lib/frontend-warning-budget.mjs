export const DEFAULT_ALLOWLIST = [
  /NO_COLOR.*FORCE_COLOR/i,
  /MAPLE_GATEWAY_ORIGIN is not set/i,
  /Cross origin request detected from 127\.0\.0\.1/i,
];

const warningSignal = /warning|deprecated|⚠/i;

function shouldSkipLine(line) {
  if (!line) return true;
  const normalized = String(line).trim();
  if (!normalized) return true;
  if (normalized.startsWith("#")) return true;
  if (normalized.startsWith(">")) return true;
  if (normalized.includes("[frontend-warning-budget]")) return true;
  if (normalized.includes("npm run check:frontend-warning-budget")) return true;
  return false;
}

export function collectWarningViolations(content, allowlist = DEFAULT_ALLOWLIST) {
  const lines = String(content ?? "").split(/\r?\n/);
  const violations = [];
  for (const rawLine of lines) {
    if (shouldSkipLine(rawLine)) continue;
    if (!warningSignal.test(rawLine)) continue;
    const allowed = allowlist.some((pattern) => pattern.test(rawLine));
    if (!allowed) {
      violations.push(rawLine.trim());
    }
  }
  return violations;
}
