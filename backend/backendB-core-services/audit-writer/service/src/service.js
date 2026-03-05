import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { dirname, resolve } from "node:path";
import { createGrpcServer, mapleLog } from "@maple/common";
const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
const PROTO_PATH = resolve(PROTO_ROOT, "maple/audit/v1/audit_writer.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_ROOT, resolve(PROTO_ROOT, "maple"), dirname(PROTO_PATH)],
});
const proto = grpc.loadPackageDefinition(packageDefinition);
const auditProto = proto.maple.audit.v1;
export function createAuditWriterService(store) {
    const server = createGrpcServer();
    const serviceImpl = {
        async AppendEvent(call, callback) {
            try {
                const event = call.request.event;
                const auditEvent = {
                    eventId: event?.eventId || "",
                    eventType: event?.eventType || "AUDIT_EVENT_TYPE_UNSPECIFIED",
                    timestamp: event?.timestamp || new Date().toISOString(),
                    sourceService: event?.sourceService || "unknown",
                    traceId: event?.context?.traceId,
                    sessionId: event?.context?.sessionId,
                    requestId: event?.context?.requestId,
                    userId: event?.context?.userId,
                    keyFingerprint: event?.context?.keyFingerprint,
                    payload: event?.payloadJson ? JSON.parse(Buffer.from(event.payloadJson).toString()) : undefined,
                    severity: event?.severity,
                    summary: event?.summary,
                };
                const eventId = await store.append(auditEvent);
                mapleLog("debug", "audit_event_appended", { eventId, type: auditEvent.eventType });
                callback(null, { eventId, persistedAt: new Date().toISOString() });
            }
            catch (err) {
                mapleLog("error", "audit_append_failed", { error: err.message });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        async AppendEventBatch(call, callback) {
            try {
                const events = (call.request.events || []).map((event) => ({
                    eventId: event?.eventId || "",
                    eventType: event?.eventType || "AUDIT_EVENT_TYPE_UNSPECIFIED",
                    timestamp: event?.timestamp || new Date().toISOString(),
                    sourceService: event?.sourceService || "unknown",
                    traceId: event?.context?.traceId,
                    sessionId: event?.context?.sessionId,
                    requestId: event?.context?.requestId,
                    userId: event?.context?.userId,
                    keyFingerprint: event?.context?.keyFingerprint,
                    severity: event?.severity,
                    summary: event?.summary,
                }));
                const eventIds = await store.appendBatch(events);
                mapleLog("debug", "audit_batch_appended", { count: eventIds.length });
                callback(null, { persistedCount: eventIds.length, eventIds, persistedAt: new Date().toISOString() });
            }
            catch (err) {
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        StreamEvents(call) {
            call.on("data", (request) => {
                void (async () => {
                    try {
                    const event = request.event;
                    const auditEvent = {
                        eventId: event?.eventId || "",
                        eventType: event?.eventType || "AUDIT_EVENT_TYPE_UNSPECIFIED",
                        timestamp: event?.timestamp || new Date().toISOString(),
                        sourceService: event?.sourceService || "unknown",
                    };
                    const eventId = await store.append(auditEvent);
                    call.write({ eventId, accepted: true });
                }
                    catch {
                        call.write({ eventId: "", accepted: false });
                    }
                })();
            });
            call.on("end", () => call.end());
        },
        async QueryEvents(call, callback) {
            try {
                const req = call.request;
                const result = await store.query({
                    traceId: req.traceId || undefined,
                    sessionId: req.sessionId || undefined,
                    sourceService: req.sourceService || undefined,
                    eventTypes: req.eventTypes?.length > 0 ? req.eventTypes : undefined,
                    since: req.since || undefined,
                    until: req.until || undefined,
                    limit: req.limit || 100,
                    cursor: req.cursor || undefined,
                });
                callback(null, {
                    events: result.events.map((e) => ({
                        eventId: e.eventId,
                        eventType: e.eventType,
                        timestamp: e.timestamp,
                        sourceService: e.sourceService,
                        summary: e.summary,
                    })),
                    nextCursor: result.nextCursor,
                    totalCount: result.totalCount,
                });
            }
            catch (err) {
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        async QueryEventsStream(call) {
            try {
                const req = call.request;
                const result = await store.query({
                    traceId: req.traceId || undefined,
                    sessionId: req.sessionId || undefined,
                    limit: req.limit || 1000,
                });
                for (const event of result.events) {
                    call.write({
                        eventId: event.eventId,
                        eventType: event.eventType,
                        timestamp: event.timestamp,
                        sourceService: event.sourceService,
                        summary: event.summary,
                    });
                }
                call.end();
            }
            catch {
                call.end();
            }
        },
    };
    server.addService(auditProto.AuditWriterService.service, serviceImpl);
    return server;
}
//# sourceMappingURL=service.js.map
