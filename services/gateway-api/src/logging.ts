import { shouldLogLevel } from "./logging-config.js";
import { currentRequestContext } from "./logging-context.js";
import { emitOtelLog } from "./logging-otel.js";
import { stringifyLogPayload } from "./logging-redaction.js";
import type { MapleLogLevel } from "./logging-types.js";

export type { MapleLogLevel } from "./logging-types.js";
export {
  requestContextStorage,
  currentRequestContext,
  type MapleRequestContext,
} from "./logging-context.js";
export {
  mapleLogLevel,
  mapleLogIncludeBodies,
  mapleLogRequestsEnabled,
  mapleLogBodyMaxChars,
  shouldLogLevel,
  shouldLogHttpRequestPath,
} from "./logging-config.js";
export {
  redactForLogs,
} from "./logging-redaction.js";
export {
  requestBodyPreview,
} from "./logging-http.js";

export function mapleLog(level: MapleLogLevel, event: string, payload?: Record<string, unknown>): void {
  if (!shouldLogLevel(level)) {
    return;
  }
  const now = new Date().toISOString();
  const context = currentRequestContext();
  const envelope: Record<string, unknown> = {
    ts: now,
    level,
    event,
    ...(context
      ? {
          requestId: context.requestId,
          requestPath: context.path,
          requestMethod: context.method,
        }
      : {}),
    ...(payload ?? {}),
  };
  const line = `[MAPLE] ${stringifyLogPayload(envelope)}`;
  emitOtelLog(level, envelope);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}
