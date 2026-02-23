import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { resolve } from "node:path";
import { mapleLog } from "@maple/common";
import { AuditStore } from "./store.js";
import { config } from "./config.js";

const PROTO_PATH = resolve(import.meta.dirname, "../../../../proto/maple/audit/v1/audit_writer.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [resolve(import.meta.dirname, "../../../../proto")],
});

const proto = grpc.loadPackageDefinition(packageDefinition) as any;
const auditProto = proto.maple.audit.v1;

export function createAuditWriterService(store: AuditStore): grpc.Server {
  const server = new grpc.Server();

  const serviceImpl = {
    AppendEvent(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
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
        const eventId = store.append(auditEvent);
        mapleLog("debug", "audit_event_appended", { eventId, type: auditEvent.eventType });
        callback(null, { eventId, persistedAt: new Date().toISOString() });
      } catch (err: any) {
        mapleLog("error", "audit_append_failed", { error: err.message });
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    AppendEventBatch(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      try {
        const events = (call.request.events || []).map((event: any) => ({
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
        const eventIds = store.appendBatch(events);
        mapleLog("debug", "audit_batch_appended", { count: eventIds.length });
        callback(null, { persistedCount: eventIds.length, eventIds, persistedAt: new Date().toISOString() });
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    StreamEvents(call: grpc.ServerDuplexStream<any, any>) {
      call.on("data", (request: any) => {
        try {
          const event = request.event;
          const auditEvent = {
            eventId: event?.eventId || "",
            eventType: event?.eventType || "AUDIT_EVENT_TYPE_UNSPECIFIED",
            timestamp: event?.timestamp || new Date().toISOString(),
            sourceService: event?.sourceService || "unknown",
          };
          const eventId = store.append(auditEvent);
          call.write({ eventId, accepted: true });
        } catch {
          call.write({ eventId: "", accepted: false });
        }
      });
      call.on("end", () => call.end());
    },

    async QueryEvents(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
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
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async QueryEventsStream(call: grpc.ServerWritableStream<any, any>) {
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
      } catch {
        call.end();
      }
    },
  };

  server.addService(auditProto.AuditWriterService.service, serviceImpl);
  return server;
}
