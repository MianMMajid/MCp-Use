/**
 * audit-emitter.ts
 *
 * Fire-and-forget helper that emits audit events to audit-writer via gRPC.
 * Non-blocking: failures are logged but never propagate to callers.
 */
import { randomUUID } from "node:crypto";
import { getGrpcClients } from "./state.js";
import { grpcUnary } from "./grpc-clients.js";
import { mapleLog } from "./logging.js";
/**
 * Emit an audit event to audit-writer. Fire-and-forget with error logging.
 */
export function emitAuditEvent(options) {
    const clients = getGrpcClients();
    if (!clients?.auditWriter) {
        return;
    }
    const event = {
        eventId: randomUUID(),
        eventType: options.eventType,
        timestamp: new Date().toISOString(),
        sourceService: options.sourceService,
        context: {
            traceId: options.traceId ?? "",
            sessionId: options.sessionId ?? "",
            userId: options.userId ?? "",
        },
        payloadJson: Buffer.from(JSON.stringify(options.payload ?? {})),
        severity: options.severity ?? "RISK_SEVERITY_LOW",
        summary: options.summary,
    };
    grpcUnary(clients.auditWriter, "appendEvent", { event }).catch((err) => {
        mapleLog("warn", "audit_emit_failed", {
            eventType: options.eventType,
            error: err instanceof Error ? err.message : String(err),
        });
    });
}
//# sourceMappingURL=audit-emitter.js.map