import type { DownstreamAppConfig } from "./downstream-proxy-types.js";

export function ensureToolAllowed(app: DownstreamAppConfig, toolName: string): void {
  const allowlist = app.toolAllowlist;
  if (!allowlist || allowlist.length === 0) {
    return;
  }
  if (!allowlist.includes(toolName)) {
    throw new Error(
      `Tool "${toolName}" is not allowlisted for downstream app "${app.id}".`,
    );
  }
}
