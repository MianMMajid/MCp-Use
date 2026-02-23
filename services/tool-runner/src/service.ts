import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { loadGrpcTlsConfig, loadServiceClientSecure, mapleLog } from "@maple/common";
import { config } from "./config.js";

const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
const PROTO_PATH = resolve(PROTO_ROOT, "maple/tools/v1/tool_runner.proto");
const grpcTlsConfig = loadGrpcTlsConfig();

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [PROTO_ROOT],
});

const proto = grpc.loadPackageDefinition(packageDefinition) as any;
const toolRunnerProto = proto.maple.tools.v1;

function loadServiceClient(protoFile: string, servicePath: string, address: string): any {
  return loadServiceClientSecure(
    protoFile,
    servicePath,
    address,
    PROTO_ROOT,
    grpcTlsConfig,
  );
}

function grpcUnary<T>(client: any, method: string, request: any): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    client[method](request, (err: grpc.ServiceError | null, response: T) => {
      if (err) rejectPromise(err);
      else resolvePromise(response);
    });
  });
}

let cyberProxyClient: any;
let auditWriterClient: any;

function getCyberProxy(): any {
  if (!cyberProxyClient) {
    cyberProxyClient = loadServiceClient(
      "maple/cyber/v1/cyber_proxy.proto",
      "maple.cyber.v1.CyberProxyService",
      config.cyberProxyAddress,
    );
  }
  return cyberProxyClient;
}

function getAuditWriter(): any {
  if (!auditWriterClient) {
    auditWriterClient = loadServiceClient(
      "maple/audit/v1/audit_writer.proto",
      "maple.audit.v1.AuditWriterService",
      config.auditWriterAddress,
    );
  }
  return auditWriterClient;
}

function emitAuditEvent(opts: {
  eventType: string;
  summary: string;
  severity?: string;
  traceId?: string;
  payload?: Record<string, unknown>;
}): void {
  try {
    grpcUnary(getAuditWriter(), "appendEvent", {
      event: {
        eventId: randomUUID(),
        eventType: opts.eventType,
        timestamp: new Date().toISOString(),
        sourceService: "tool-runner",
        context: { traceId: opts.traceId ?? "" },
        payloadJson: Buffer.from(JSON.stringify(opts.payload ?? {})),
        severity: opts.severity ?? "RISK_SEVERITY_LOW",
        summary: opts.summary,
      },
    }).catch((err) => {
      mapleLog("warn", "tool_runner_audit_emit_failed", { error: err.message });
    });
  } catch {
    // fire-and-forget
  }
}

export function createToolRunnerService(): grpc.Server {
  const server = new grpc.Server();

  const serviceImpl = {
    async ExecuteJsonRpc(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      const startedAt = Date.now();
      try {
        const appId = String(call.request.appId || "");
        const targetUrl = String(call.request.targetUrl || "").trim();
        const timeoutMs = Number(call.request.timeoutMs || 0) > 0
          ? Number(call.request.timeoutMs)
          : 30_000;
        const credentialId = String(call.request.credentialId || "").trim();
        const credentialToken = String(call.request.credentialToken || "").trim();
        const credentialScopes = Array.isArray(call.request.credentialScopes)
          ? call.request.credentialScopes.map((scope: unknown) => String(scope)).filter((scope: string) => scope.length > 0)
          : [];

        if (!targetUrl) {
          callback({ code: grpc.status.INVALID_ARGUMENT, message: "targetUrl is required" });
          return;
        }

        const payloadRaw = call.request.payloadJson;
        let payloadJson = "{}";
        if (payloadRaw) {
          payloadJson = typeof payloadRaw === "string"
            ? payloadRaw
            : Buffer.isBuffer(payloadRaw)
              ? payloadRaw.toString("utf-8")
              : String(payloadRaw);
        }

        // Validate payload shape once here so downstream services can trust it.
        try {
          JSON.parse(payloadJson);
        } catch {
          callback({ code: grpc.status.INVALID_ARGUMENT, message: "payloadJson must be valid JSON" });
          return;
        }

        const outboundHeaders: Record<string, string> = {
          "content-type": "application/json",
          accept: "application/json",
        };
        if (credentialId) {
          outboundHeaders["x-maple-credential-id"] = credentialId;
        }
        if (credentialToken) {
          outboundHeaders["x-maple-credential-token"] = credentialToken;
        }
        if (credentialScopes.length > 0) {
          outboundHeaders["x-maple-credential-scopes"] = credentialScopes.join(",");
        }

        const response = await grpcUnary<any>(getCyberProxy(), "proxyHttpRequest", {
          context: call.request.context ?? {},
          method: "POST",
          url: targetUrl,
          headers: outboundHeaders,
          body: Buffer.from(payloadJson),
          timeoutMs,
        });

        const statusCode = Number(response?.statusCode ?? 502);
        const responseJson = response?.body
          ? (Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body))
          : Buffer.from("{}");

        if (statusCode >= 400) {
          const errorMessage = `tool-runner cyber-proxy returned HTTP ${statusCode}`;
          emitAuditEvent({
            eventType: "AUDIT_EVENT_TYPE_TOOL_FAILED",
            summary: errorMessage,
            severity: statusCode === 403 ? "RISK_SEVERITY_HIGH" : "RISK_SEVERITY_MEDIUM",
            traceId: call.request.context?.traceId,
            payload: { appId, targetUrl, statusCode, credentialId },
          });
          callback(null, {
            success: false,
            responseJson,
            errorMessage,
            durationMs: Date.now() - startedAt,
            statusCode,
          });
          return;
        }

        emitAuditEvent({
          eventType: "AUDIT_EVENT_TYPE_TOOL_COMPLETED",
          summary: `tool-runner executed JSON-RPC for ${appId || "dynamic-target"}`,
          traceId: call.request.context?.traceId,
          payload: {
            appId,
            targetUrl,
            statusCode,
            durationMs: Date.now() - startedAt,
            credentialId,
            credentialScopes,
          },
        });

        callback(null, {
          success: true,
          responseJson,
          errorMessage: "",
          durationMs: Date.now() - startedAt,
          statusCode,
        });
      } catch (err: any) {
        mapleLog("error", "tool_runner_execute_jsonrpc_failed", { error: err.message });
        emitAuditEvent({
          eventType: "AUDIT_EVENT_TYPE_TOOL_FAILED",
          summary: "tool-runner execution failed",
          severity: "RISK_SEVERITY_MEDIUM",
          traceId: call.request?.context?.traceId,
          payload: { error: err.message },
        });
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },
  };

  server.addService(toolRunnerProto.ToolRunnerService.service, serviceImpl);
  return server;
}
