import { shouldLogLevel } from "./logging-config.js";
import { currentRequestContext } from "./logging-context.js";
import { emitOtelLog } from "./logging-otel.js";
import { stringifyLogPayload } from "./logging-redaction.js";
export { requestContextStorage, currentRequestContext, } from "./logging-context.js";
export { mapleLogLevel, mapleLogIncludeBodies, mapleLogRequestsEnabled, mapleLogBodyMaxChars, shouldLogLevel, shouldLogHttpRequestPath, } from "./logging-config.js";
export { redactForLogs, } from "./logging-redaction.js";
export { requestBodyPreview, } from "./logging-http.js";
export function mapleLog(level, event, payload) {
    if (!shouldLogLevel(level)) {
        return;
    }
    const now = new Date().toISOString();
    const context = currentRequestContext();
    const envelope = {
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
//# sourceMappingURL=logging.js.map