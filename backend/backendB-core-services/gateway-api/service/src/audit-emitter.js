/**
 * audit-emitter.js
 *
 * Durable audit emitter. Routes events through the outbox for guaranteed
 * delivery with retry, then flushes to audit-writer via gRPC.
 * Falls back to fire-and-forget gRPC when outbox is unavailable.
 */
import { randomUUID } from "node:crypto";
import { CircuitBreaker } from "@maple/common";
import { getGrpcClients } from "./state.js";
import { grpcUnary } from "./grpc-clients.js";
import { mapleLog } from "./logging.js";
import { enqueueAuditEvent } from "./core/audit-outbox.js";
import { appendToAuditChain } from "./core/audit-integrity.js";
import { createSpanContext } from "./core/trace-context.js";
import { recordSpan } from "./core/trace-exporter.js";

const auditWriterBreaker = new CircuitBreaker("audit-writer-grpc", {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    halfOpenMaxAttempts: 3,
});

/**
 * Emit an audit event durably via outbox (preferred) or fire-and-forget gRPC (fallback).
 */
export function emitAuditEvent(options) {
    // B2: Generate span context for distributed tracing
    const span = createSpanContext(options.traceId);

    // Generate a single eventId to use across outbox and audit chain
    const eventId = randomUUID();
    const event = {
        eventId,
        eventType: options.eventType,
        timestamp: new Date().toISOString(),
        sourceService: options.sourceService,
        traceId: span.traceId,
        spanId: span.spanId,
        severity: options.severity ?? "RISK_SEVERITY_LOW",
        summary: options.summary,
    };

    try {
        enqueueAuditEvent({ ...options, eventId, traceId: span.traceId, spanId: span.spanId }).catch(() => {});
    } catch {
        // Outbox unavailable — fall back to direct gRPC
        const clients = getGrpcClients();
        if (!clients?.auditWriter) {
            return;
        }
        const grpcEvent = {
            ...event,
            context: {
                traceId: span.traceId,
                sessionId: options.sessionId ?? "",
                userId: options.userId ?? "",
            },
            payloadJson: Buffer.from(JSON.stringify(options.payload ?? {})),
        };
        auditWriterBreaker.execute(() =>
            grpcUnary(clients.auditWriter, "appendEvent", { event: grpcEvent })
        ).catch((err) => {
            mapleLog("warn", "audit_emit_failed", {
                eventType: options.eventType,
                error: err instanceof Error ? err.message : String(err),
            });
        });
    }

    // B2/B5: Record span for OTLP export
    recordSpan({
        traceId: span.traceId,
        spanId: span.spanId,
        operationName: `audit.${options.eventType}`,
        startTime: span.timestamp,
        endTime: Date.now(),
        attributes: {
            "audit.event_type": options.eventType,
            "audit.source_service": options.sourceService ?? "",
            "audit.severity": options.severity ?? "RISK_SEVERITY_LOW",
            "audit.tenant_id": options.payload?.tenantId ?? "",
            "audit.org_id": options.payload?.orgId ?? "",
        },
        status: { code: 0 },
    });

    // A6: Append to audit chain for tamper-evident logging
    appendToAuditChain({
        eventId: event.eventId,
        eventType: options.eventType,
        timestamp: event.timestamp,
        sourceService: options.sourceService,
        tenantId: options.payload?.tenantId ?? "",
        orgId: options.payload?.orgId ?? "",
        userId: options.userId ?? "",
        severity: options.severity,
        summary: options.summary,
        payloadJson: JSON.stringify(options.payload ?? {}),
    }).catch(() => {}); // Non-blocking; outbox is primary delivery
}
