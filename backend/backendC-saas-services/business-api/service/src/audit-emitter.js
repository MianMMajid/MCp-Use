import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadGrpcTlsConfig,
  loadServiceClientSecure,
  mapleLog,
} from "@maple/common";
import { auditWriterAddress } from "./config.js";

const PROTO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../proto");

function loadAuditClient() {
  const tlsConfig = loadGrpcTlsConfig();
  return loadServiceClientSecure(
    "maple/audit/v1/audit_writer.proto",
    "maple.audit.v1.AuditWriterService",
    auditWriterAddress,
    PROTO_ROOT,
    tlsConfig
  );
}

function grpcUnary(client, method, request) {
  return new Promise((resolveResponse, rejectResponse) => {
    client[method](request, (err, response) => {
      if (err) {
        rejectResponse(err);
        return;
      }
      resolveResponse(response);
    });
  });
}

export function createAuditEmitter() {
  const disabled =
    String(process.env.MAPLE_DISABLE_AUDIT_EMIT ?? "0").trim().toLowerCase() ===
      "true" ||
    String(process.env.MAPLE_DISABLE_AUDIT_EMIT ?? "0").trim() === "1";
  if (disabled) {
    return () => {};
  }

  let client;
  try {
    client = loadAuditClient();
  } catch (err) {
    mapleLog("warn", "business_api.audit_client_init_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return () => {};
  }

  return (event) => {
    const context = event.context ?? {};
    grpcUnary(client, "appendEvent", {
      event: {
        eventId: randomUUID(),
        eventType: event.eventType ?? "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
        timestamp: new Date().toISOString(),
        sourceService: "business-api",
        context: {
          traceId: String(context.traceId ?? ""),
          sessionId: String(context.sessionId ?? ""),
          requestId: String(context.requestId ?? ""),
          userId: String(context.userId ?? ""),
          tenantId: String(context.tenantId ?? ""),
          deviceId: String(context.deviceId ?? ""),
          sourceService: "business-api",
        },
        payloadJson: Buffer.from(JSON.stringify(event.payload ?? {})),
        severity: event.severity ?? "RISK_SEVERITY_LOW",
        summary: String(event.summary ?? "business-api request"),
      },
    }).catch((err) => {
      mapleLog("warn", "business_api.audit_emit_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };
}
