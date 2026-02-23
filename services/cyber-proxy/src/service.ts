import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { loadGrpcTlsConfig, loadServiceClientSecure, mapleLog } from "@maple/common";
import { checkUrl, scanContent } from "./ssrf-guard.js";
import { config } from "./config.js";

const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
const grpcTlsConfig = loadGrpcTlsConfig();

// ── Lightweight audit event emitter ──────────────────────────────────────────

function emitAuditEvent(opts: { eventType: string; summary: string; payload?: Record<string, unknown> }): void {
  try {
    const client = loadServiceClientSecure(
      "maple/audit/v1/audit_writer.proto",
      "maple.audit.v1.AuditWriterService",
      config.auditWriterAddress,
      PROTO_ROOT,
      grpcTlsConfig,
    );
    client.appendEvent({
      event: {
        eventId: randomUUID(),
        eventType: opts.eventType,
        timestamp: new Date().toISOString(),
        sourceService: "cyber-proxy",
        payloadJson: Buffer.from(JSON.stringify(opts.payload ?? {})),
        severity: "RISK_SEVERITY_MEDIUM",
        summary: opts.summary,
      },
    }, () => { /* fire-and-forget */ });
  } catch {
    // Audit emission is fire-and-forget
  }
}

const PROTO_PATH = resolve(PROTO_ROOT, "maple/cyber/v1/cyber_proxy.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
  includeDirs: [PROTO_ROOT],
});

const proto = grpc.loadPackageDefinition(packageDefinition) as any;
const cyberProto = proto.maple.cyber.v1;

export function createCyberProxyService(): grpc.Server {
  const server = new grpc.Server();

  const serviceImpl = {
    async CheckUrl(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      try {
        const result = await checkUrl(call.request.url, config.allowedDomains, config.blockedDomains);
        mapleLog("debug", "cyber_check_url", { url: call.request.url, allowed: result.allowed });
        callback(null, {
          allowed: result.allowed, reason: result.reason, isPrivateIp: result.isPrivateIp,
          resolvedIp: result.resolvedIp, normalizedUrl: result.normalizedUrl,
        });
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    ScanContent(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      try {
        const content = call.request.content || Buffer.alloc(0);
        const contentType = call.request.contentType || "text/plain";
        const sourceUrl = call.request.sourceUrl || "";
        const result = scanContent(Buffer.from(content), contentType, sourceUrl || undefined);
        if (result.quarantined) {
          emitAuditEvent({
            eventType: "AUDIT_EVENT_TYPE_CONTENT_SCANNED",
            summary: `Content quarantined: ${result.quarantineReason}`,
            payload: { sourceUrl, threats: result.threats, quarantineReason: result.quarantineReason },
          });
        }
        callback(null, {
          safe: result.safe, threatsFound: result.threats,
          sanitizedContent: result.sanitized,
          scanSummary: result.quarantined ? `Quarantined: ${result.quarantineReason}` : result.safe ? "Content is safe" : `Found ${result.threats.length} threats`,
          quarantined: result.quarantined,
        });
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async GetReputation(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      try {
        const url = call.request.url || "";
        const urlCheck = await checkUrl(url, config.allowedDomains, config.blockedDomains);
        const knownMalicious = !urlCheck.allowed && urlCheck.reason !== "OK";
        // Score: 1.0 = fully trusted, 0.0 = blocked/malicious
        const reputationScore = urlCheck.allowed ? (urlCheck.isPrivateIp ? 0.3 : 0.9) : 0.1;
        const category = knownMalicious ? "blocked" : urlCheck.isPrivateIp ? "private" : "public";
        mapleLog("debug", "cyber_get_reputation", { url, allowed: urlCheck.allowed, score: reputationScore });
        callback(null, {
          reputationScore,
          category,
          knownMalicious,
          lastChecked: new Date().toISOString(),
        });
      } catch (err: any) {
        mapleLog("error", "cyber_get_reputation_failed", { error: err.message });
        callback(null, { reputationScore: 0.5, category: "error", knownMalicious: false, lastChecked: new Date().toISOString() });
      }
    },

    async ProxyHttpRequest(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      try {
        const { method, url, headers, body, timeoutMs } = call.request;
        const urlCheck = await checkUrl(url, config.allowedDomains, config.blockedDomains);
        if (!urlCheck.allowed) {
          emitAuditEvent({
            eventType: "AUDIT_EVENT_TYPE_URL_BLOCKED",
            summary: `URL blocked: ${url} — ${urlCheck.reason}`,
            payload: { url, reason: urlCheck.reason, resolvedIp: urlCheck.resolvedIp },
          });
          callback(null, { statusCode: 403, headers: {}, body: Buffer.from(JSON.stringify({ error: urlCheck.reason })), durationMs: 0, resolvedIp: urlCheck.resolvedIp });
          return;
        }
        const start = Date.now();
        const timeout = Math.min(timeoutMs || config.requestTimeoutMs, 60000);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
          const resp = await fetch(url, {
            method: method || "GET",
            headers: headers || {},
            body: method !== "GET" && method !== "HEAD" ? body : undefined,
            signal: controller.signal,
          });
          clearTimeout(timer);
          const respBody = Buffer.from(await resp.arrayBuffer());
          const respHeaders: Record<string, string> = {};
          resp.headers.forEach((v, k) => { respHeaders[k] = v; });

          // Scan response content for threats before returning
          const contentType = respHeaders["content-type"] || "application/octet-stream";
          const scanResult = scanContent(respBody, contentType, url);
          if (scanResult.quarantined) {
            mapleLog("warn", "cyber_proxy_content_quarantined", { url, reason: scanResult.quarantineReason, threats: scanResult.threats });
            emitAuditEvent({
              eventType: "AUDIT_EVENT_TYPE_CONTENT_SCANNED",
              summary: `Download quarantined: ${scanResult.quarantineReason}`,
              payload: { url, reason: scanResult.quarantineReason, threats: scanResult.threats },
            });
            callback(null, {
              statusCode: 403,
              headers: respHeaders,
              body: Buffer.from(JSON.stringify({ error: "Download quarantined", reason: scanResult.quarantineReason, threats: scanResult.threats })),
              durationMs: Date.now() - start,
              resolvedIp: urlCheck.resolvedIp,
            });
            return;
          }
          if (!scanResult.safe) {
            mapleLog("warn", "cyber_proxy_content_blocked", { url, threats: scanResult.threats });
            callback(null, {
              statusCode: 403,
              headers: respHeaders,
              body: Buffer.from(JSON.stringify({ error: "Response content blocked", threats: scanResult.threats })),
              durationMs: Date.now() - start,
              resolvedIp: urlCheck.resolvedIp,
            });
            return;
          }
          // Use sanitized content if available
          const finalBody = scanResult.sanitized.length > 0 ? scanResult.sanitized : respBody;
          callback(null, { statusCode: resp.status, headers: respHeaders, body: finalBody, durationMs: Date.now() - start, resolvedIp: urlCheck.resolvedIp });
        } catch (err: any) {
          clearTimeout(timer);
          callback(null, { statusCode: 502, headers: {}, body: Buffer.from(JSON.stringify({ error: err.message })), durationMs: Date.now() - start, resolvedIp: "" });
        }
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async ProxyHttpRequestStream(call: grpc.ServerWritableStream<any, any>) {
      try {
        const { method, url, headers, body, timeoutMs } = call.request;
        const urlCheck = await checkUrl(url, config.allowedDomains, config.blockedDomains);
        if (!urlCheck.allowed) {
          call.write({ data: Buffer.from(JSON.stringify({ error: urlCheck.reason })), isFinal: true, statusCode: 403, headers: {} });
          call.end();
          return;
        }
        const timeout = Math.min(timeoutMs || config.requestTimeoutMs, 60000);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        const resp = await fetch(url, {
          method: method || "GET",
          headers: headers || {},
          body: method !== "GET" && method !== "HEAD" ? body : undefined,
          signal: controller.signal,
        });
        clearTimeout(timer);
        const respHeaders: Record<string, string> = {};
        resp.headers.forEach((v, k) => { respHeaders[k] = v; });

        // For security, stream mode performs full-buffer scanning before emit.
        const respBody = Buffer.from(await resp.arrayBuffer());
        const contentType = respHeaders["content-type"] || "application/octet-stream";
        const scanResult = scanContent(respBody, contentType, url);
        if (scanResult.quarantined) {
          emitAuditEvent({
            eventType: "AUDIT_EVENT_TYPE_CONTENT_SCANNED",
            summary: `Stream download quarantined: ${scanResult.quarantineReason}`,
            payload: { url, reason: scanResult.quarantineReason, threats: scanResult.threats },
          });
          call.write({
            data: Buffer.from(JSON.stringify({ error: "Download quarantined", reason: scanResult.quarantineReason, threats: scanResult.threats })),
            isFinal: true,
            statusCode: 403,
            headers: respHeaders,
          });
          call.end();
          return;
        }
        if (!scanResult.safe) {
          call.write({
            data: Buffer.from(JSON.stringify({ error: "Response content blocked", threats: scanResult.threats })),
            isFinal: true,
            statusCode: 403,
            headers: respHeaders,
          });
          call.end();
          return;
        }
        const finalBody = scanResult.sanitized.length > 0 ? scanResult.sanitized : respBody;
        call.write({ data: finalBody, isFinal: true, statusCode: resp.status, headers: respHeaders });
        call.end();
      } catch {
        call.write({
          data: Buffer.from(JSON.stringify({ error: "Upstream request failed" })),
          isFinal: true,
          statusCode: 502,
          headers: {},
        });
        call.end();
      }
    },
  };

  server.addService(cyberProto.CyberProxyService.service, serviceImpl);
  return server;
}
