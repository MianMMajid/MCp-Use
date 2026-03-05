import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { loadGrpcTlsConfig, loadServiceClientSecurePooled, createGrpcServer, CircuitBreaker, mapleLog } from "@maple/common";
import { checkUrl, scanContent } from "./ssrf-guard.js";
import { config } from "./config.js";
const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
const grpcTlsConfig = loadGrpcTlsConfig();
let auditWriterPool;
const auditWriterBreaker = new CircuitBreaker("cyber-proxy->audit-writer", { failureThreshold: 5, resetTimeoutMs: 30000 });
function getAuditWriter() {
    if (!auditWriterPool) {
        auditWriterPool = loadServiceClientSecurePooled("maple/audit/v1/audit_writer.proto", "maple.audit.v1.AuditWriterService", config.auditWriterAddress, PROTO_ROOT, grpcTlsConfig);
    }
    return auditWriterPool.getClient();
}
// ── Lightweight audit event emitter ──────────────────────────────────────────
function grpcUnaryPromise(client, method, request) {
    return new Promise((resolve, reject) => {
        client[method](request, (err, response) => {
            if (err) reject(err);
            else resolve(response);
        });
    });
}
function emitAuditEvent(opts) {
    try {
        auditWriterBreaker.execute(() => grpcUnaryPromise(getAuditWriter(), "appendEvent", {
            event: {
                eventId: randomUUID(),
                eventType: opts.eventType,
                timestamp: new Date().toISOString(),
                sourceService: "cyber-proxy",
                payloadJson: Buffer.from(JSON.stringify(opts.payload ?? {})),
                severity: "RISK_SEVERITY_MEDIUM",
                summary: opts.summary,
            },
        })).catch(() => {});
    }
    catch {
        // Audit emission is fire-and-forget
    }
}
const PROTO_PATH = resolve(PROTO_ROOT, "maple/cyber/v1/cyber_proxy.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
    includeDirs: [PROTO_ROOT, resolve(PROTO_ROOT, "maple"), dirname(PROTO_PATH)],
});
const proto = grpc.loadPackageDefinition(packageDefinition);
const cyberProto = proto.maple.cyber.v1;
export function closeCyberProxyClients() {
    auditWriterPool?.close();
    auditWriterPool = undefined;
}
function hostnameMatchesDomain(hostname, domain) {
    const normalizedHost = hostname.toLowerCase();
    const normalizedDomain = domain.toLowerCase();
    return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}
function normalizeDomainList(values) {
    return [...new Set(values.map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0))];
}
function getHeaderIgnoreCase(headers, headerName) {
    const wanted = headerName.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === wanted) {
            return String(value ?? "");
        }
    }
    return undefined;
}
function sanitizeOutboundHeaders(headers) {
    const sanitized = {};
    for (const [key, value] of Object.entries(headers)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey.startsWith("x-maple-credential-") ||
            lowerKey.startsWith("x-maple-policy-")) {
            continue;
        }
        sanitized[key] = value;
    }
    return sanitized;
}
function parseCredentialScopes(headers) {
    const rawScopes = getHeaderIgnoreCase(headers, "x-maple-credential-scopes") ?? "";
    const scopes = rawScopes
        .split(",")
        .map((scope) => scope.trim())
        .filter((scope) => scope.length > 0);
    const allowedDomains = [];
    let maxBytes;
    let allowFileDownload = true;
    for (const scope of scopes) {
        if (scope.startsWith("domain:")) {
            const domain = scope.slice("domain:".length).trim().toLowerCase();
            if (domain.length > 0) {
                allowedDomains.push(domain);
            }
            continue;
        }
        if (scope.startsWith("max_bytes:")) {
            const parsed = Number.parseInt(scope.slice("max_bytes:".length), 10);
            if (Number.isFinite(parsed) && parsed > 0) {
                maxBytes = maxBytes === undefined ? parsed : Math.min(maxBytes, parsed);
            }
            continue;
        }
        if (scope === "download:blocked") {
            allowFileDownload = false;
        }
    }
    return {
        allowedDomains: normalizeDomainList(allowedDomains),
        maxBytes,
        allowFileDownload,
    };
}
function isDownloadLikeResponse(contentType, headers) {
    const contentDisposition = getHeaderIgnoreCase(headers, "content-disposition") ?? "";
    if (contentDisposition.toLowerCase().includes("attachment")) {
        return true;
    }
    const ct = contentType.toLowerCase();
    if (!ct)
        return false;
    if (ct.startsWith("text/"))
        return false;
    if (ct.includes("application/json"))
        return false;
    if (ct.includes("application/javascript"))
        return false;
    if (ct.includes("application/xml"))
        return false;
    if (ct.includes("application/x-www-form-urlencoded"))
        return false;
    if (ct.includes("image/svg+xml"))
        return false;
    return true;
}
async function evaluateUrlPolicy(url, toolName, scopedAllowedDomains) {
    const urlCheck = await checkUrl(url, [], config.blockedDomains);
    if (!urlCheck.allowed) {
        return {
            allowed: false,
            reason: urlCheck.reason,
            isPrivateIp: urlCheck.isPrivateIp,
            resolvedIp: urlCheck.resolvedIp,
            normalizedUrl: urlCheck.normalizedUrl,
        };
    }
    let hostname = "";
    try {
        hostname = new URL(urlCheck.normalizedUrl).hostname.toLowerCase();
    }
    catch {
        return {
            allowed: false,
            reason: "Invalid normalized URL",
            isPrivateIp: false,
            resolvedIp: urlCheck.resolvedIp,
            normalizedUrl: urlCheck.normalizedUrl,
        };
    }
    const globalAllowedDomains = normalizeDomainList(config.allowedDomains);
    if (globalAllowedDomains.length > 0 && !globalAllowedDomains.some((domain) => hostnameMatchesDomain(hostname, domain))) {
        return {
            allowed: false,
            reason: "Domain not on global allowlist",
            isPrivateIp: false,
            resolvedIp: urlCheck.resolvedIp,
            normalizedUrl: urlCheck.normalizedUrl,
        };
    }
    const perToolAllowedDomains = normalizeDomainList(config.toolAllowedDomains[toolName] ?? []);
    if (perToolAllowedDomains.length > 0 && !perToolAllowedDomains.some((domain) => hostnameMatchesDomain(hostname, domain))) {
        return {
            allowed: false,
            reason: `Domain not on allowlist for tool ${toolName}`,
            isPrivateIp: false,
            resolvedIp: urlCheck.resolvedIp,
            normalizedUrl: urlCheck.normalizedUrl,
        };
    }
    if (scopedAllowedDomains.length > 0 && !scopedAllowedDomains.some((domain) => hostnameMatchesDomain(hostname, domain))) {
        return {
            allowed: false,
            reason: "Domain not allowed by scoped credential",
            isPrivateIp: false,
            resolvedIp: urlCheck.resolvedIp,
            normalizedUrl: urlCheck.normalizedUrl,
        };
    }
    return {
        allowed: true,
        reason: "OK",
        isPrivateIp: false,
        resolvedIp: urlCheck.resolvedIp,
        normalizedUrl: urlCheck.normalizedUrl,
    };
}
export function createCyberProxyService() {
    const server = createGrpcServer();
    const serviceImpl = {
        async CheckUrl(call, callback) {
            try {
                const result = await evaluateUrlPolicy(call.request.url, String(call.request.toolName || "jsonrpc.forward"), []);
                mapleLog("debug", "cyber_check_url", { url: call.request.url, allowed: result.allowed });
                callback(null, {
                    allowed: result.allowed, reason: result.reason, isPrivateIp: result.isPrivateIp,
                    resolvedIp: result.resolvedIp, normalizedUrl: result.normalizedUrl,
                });
            }
            catch (err) {
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        ScanContent(call, callback) {
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
            }
            catch (err) {
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        async GetReputation(call, callback) {
            try {
                const url = call.request.url || "";
                const urlCheck = await evaluateUrlPolicy(url, "jsonrpc.forward", []);
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
            }
            catch (err) {
                mapleLog("error", "cyber_get_reputation_failed", { error: err.message });
                callback(null, { reputationScore: 0.5, category: "error", knownMalicious: false, lastChecked: new Date().toISOString() });
            }
        },
        async ProxyHttpRequest(call, callback) {
            try {
                const { method, url, headers, body, timeoutMs } = call.request;
                const inboundHeaders = (headers && typeof headers === "object") ? headers : {};
                const scope = parseCredentialScopes(inboundHeaders);
                const effectiveMaxBytes = scope.maxBytes ? Math.min(scope.maxBytes, config.maxResponseBytes) : config.maxResponseBytes;
                const toolName = String(call.request.toolName || "jsonrpc.forward");
                const urlCheck = await evaluateUrlPolicy(url, toolName, scope.allowedDomains);
                if (!urlCheck.allowed) {
                    emitAuditEvent({
                        eventType: "AUDIT_EVENT_TYPE_URL_BLOCKED",
                        summary: `URL blocked: ${url} — ${urlCheck.reason}`,
                        payload: {
                            url,
                            reason: urlCheck.reason,
                            resolvedIp: urlCheck.resolvedIp,
                            toolName,
                            appId: call.request.appId || "",
                            scopedAllowedDomains: scope.allowedDomains,
                        },
                    });
                    callback(null, {
                        statusCode: 403,
                        headers: {},
                        body: Buffer.from(JSON.stringify({ error: urlCheck.reason })),
                        durationMs: 0,
                        resolvedIp: urlCheck.resolvedIp,
                        sanitized: false,
                        malwareDetected: false,
                        quarantined: false,
                        threatsFound: [],
                        quarantineReason: "",
                        policyReason: urlCheck.reason,
                    });
                    return;
                }
                const start = Date.now();
                const timeout = Math.min(timeoutMs || config.requestTimeoutMs, 60000);
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeout);
                try {
                    const resp = await fetch(url, {
                        method: method || "GET",
                        headers: sanitizeOutboundHeaders(inboundHeaders),
                        body: method !== "GET" && method !== "HEAD" ? body : undefined,
                        signal: controller.signal,
                    });
                    clearTimeout(timer);
                    const respBody = Buffer.from(await resp.arrayBuffer());
                    const respHeaders = {};
                    resp.headers.forEach((v, k) => { respHeaders[k] = v; });
                    if (respBody.length > effectiveMaxBytes) {
                        const reason = `Response exceeds scoped max_bytes (${respBody.length} > ${effectiveMaxBytes})`;
                        emitAuditEvent({
                            eventType: "AUDIT_EVENT_TYPE_CONTENT_SCANNED",
                            summary: reason,
                            payload: { url, appId: call.request.appId || "", toolName, scopedMaxBytes: effectiveMaxBytes },
                        });
                        callback(null, {
                            statusCode: 403,
                            headers: respHeaders,
                            body: Buffer.from(JSON.stringify({ error: "Response blocked by scoped size policy", reason })),
                            durationMs: Date.now() - start,
                            resolvedIp: urlCheck.resolvedIp,
                            sanitized: false,
                            malwareDetected: false,
                            quarantined: true,
                            threatsFound: ["max_bytes_exceeded"],
                            quarantineReason: reason,
                            policyReason: reason,
                        });
                        return;
                    }
                    // Scan response content for threats before returning
                    const contentType = respHeaders["content-type"] || "application/octet-stream";
                    if (!scope.allowFileDownload && isDownloadLikeResponse(contentType, respHeaders)) {
                        const reason = "File download blocked by credential scope";
                        emitAuditEvent({
                            eventType: "AUDIT_EVENT_TYPE_CONTENT_SCANNED",
                            summary: reason,
                            payload: { url, appId: call.request.appId || "", toolName, contentType },
                        });
                        callback(null, {
                            statusCode: 403,
                            headers: respHeaders,
                            body: Buffer.from(JSON.stringify({ error: reason })),
                            durationMs: Date.now() - start,
                            resolvedIp: urlCheck.resolvedIp,
                            sanitized: false,
                            malwareDetected: false,
                            quarantined: true,
                            threatsFound: ["download_blocked"],
                            quarantineReason: reason,
                            policyReason: reason,
                        });
                        return;
                    }
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
                            sanitized: false,
                            malwareDetected: true,
                            quarantined: true,
                            threatsFound: scanResult.threats,
                            quarantineReason: scanResult.quarantineReason || "",
                            policyReason: scanResult.quarantineReason || "content_quarantined",
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
                            sanitized: false,
                            malwareDetected: true,
                            quarantined: false,
                            threatsFound: scanResult.threats,
                            quarantineReason: "",
                            policyReason: "content_blocked",
                        });
                        return;
                    }
                    // Use sanitized content if available
                    const finalBody = scanResult.sanitized.length > 0 ? scanResult.sanitized : respBody;
                    callback(null, {
                        statusCode: resp.status,
                        headers: respHeaders,
                        body: finalBody,
                        durationMs: Date.now() - start,
                        resolvedIp: urlCheck.resolvedIp,
                        sanitized: finalBody !== respBody,
                        malwareDetected: false,
                        quarantined: false,
                        threatsFound: [],
                        quarantineReason: "",
                        policyReason: "ok",
                    });
                }
                catch (err) {
                    clearTimeout(timer);
                    callback(null, {
                        statusCode: 502,
                        headers: {},
                        body: Buffer.from(JSON.stringify({ error: err.message })),
                        durationMs: Date.now() - start,
                        resolvedIp: "",
                        sanitized: false,
                        malwareDetected: false,
                        quarantined: false,
                        threatsFound: [],
                        quarantineReason: "",
                        policyReason: err.message || "upstream_error",
                    });
                }
            }
            catch (err) {
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        async ProxyHttpRequestStream(call) {
            try {
                const { method, url, headers, body, timeoutMs } = call.request;
                const inboundHeaders = (headers && typeof headers === "object") ? headers : {};
                const scope = parseCredentialScopes(inboundHeaders);
                const effectiveMaxBytes = scope.maxBytes ? Math.min(scope.maxBytes, config.maxResponseBytes) : config.maxResponseBytes;
                const toolName = String(call.request.toolName || "jsonrpc.forward");
                const urlCheck = await evaluateUrlPolicy(url, toolName, scope.allowedDomains);
                if (!urlCheck.allowed) {
                    call.write({
                        data: Buffer.from(JSON.stringify({ error: urlCheck.reason })),
                        isFinal: true,
                        statusCode: 403,
                        headers: {},
                        sanitized: false,
                        malwareDetected: false,
                        quarantined: false,
                        threatsFound: [],
                        quarantineReason: "",
                        policyReason: urlCheck.reason,
                        resolvedIp: urlCheck.resolvedIp,
                    });
                    call.end();
                    return;
                }
                const timeout = Math.min(timeoutMs || config.requestTimeoutMs, 60000);
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeout);
                const resp = await fetch(url, {
                    method: method || "GET",
                    headers: sanitizeOutboundHeaders(inboundHeaders),
                    body: method !== "GET" && method !== "HEAD" ? body : undefined,
                    signal: controller.signal,
                });
                clearTimeout(timer);
                const respHeaders = {};
                resp.headers.forEach((v, k) => { respHeaders[k] = v; });
                // For security, stream mode performs full-buffer scanning before emit.
                const respBody = Buffer.from(await resp.arrayBuffer());
                const contentType = respHeaders["content-type"] || "application/octet-stream";
                if (respBody.length > effectiveMaxBytes) {
                    call.write({
                        data: Buffer.from(JSON.stringify({
                            error: "Response blocked by scoped size policy",
                            reason: `Response exceeds scoped max_bytes (${respBody.length} > ${effectiveMaxBytes})`,
                        })),
                        isFinal: true,
                        statusCode: 403,
                        headers: respHeaders,
                        sanitized: false,
                        malwareDetected: false,
                        quarantined: true,
                        threatsFound: ["max_bytes_exceeded"],
                        quarantineReason: `Response exceeds scoped max_bytes (${respBody.length} > ${effectiveMaxBytes})`,
                        policyReason: "max_bytes_exceeded",
                        resolvedIp: urlCheck.resolvedIp,
                    });
                    call.end();
                    return;
                }
                if (!scope.allowFileDownload && isDownloadLikeResponse(contentType, respHeaders)) {
                    call.write({
                        data: Buffer.from(JSON.stringify({ error: "File download blocked by credential scope" })),
                        isFinal: true,
                        statusCode: 403,
                        headers: respHeaders,
                        sanitized: false,
                        malwareDetected: false,
                        quarantined: true,
                        threatsFound: ["download_blocked"],
                        quarantineReason: "File download blocked by credential scope",
                        policyReason: "download_blocked",
                        resolvedIp: urlCheck.resolvedIp,
                    });
                    call.end();
                    return;
                }
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
                        sanitized: false,
                        malwareDetected: true,
                        quarantined: true,
                        threatsFound: scanResult.threats,
                        quarantineReason: scanResult.quarantineReason || "",
                        policyReason: scanResult.quarantineReason || "content_quarantined",
                        resolvedIp: urlCheck.resolvedIp,
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
                        sanitized: false,
                        malwareDetected: true,
                        quarantined: false,
                        threatsFound: scanResult.threats,
                        quarantineReason: "",
                        policyReason: "content_blocked",
                        resolvedIp: urlCheck.resolvedIp,
                    });
                    call.end();
                    return;
                }
                const finalBody = scanResult.sanitized.length > 0 ? scanResult.sanitized : respBody;
                call.write({
                    data: finalBody,
                    isFinal: true,
                    statusCode: resp.status,
                    headers: respHeaders,
                    sanitized: finalBody !== respBody,
                    malwareDetected: false,
                    quarantined: false,
                    threatsFound: [],
                    quarantineReason: "",
                    policyReason: "ok",
                    resolvedIp: urlCheck.resolvedIp,
                });
                call.end();
            }
            catch {
                call.write({
                    data: Buffer.from(JSON.stringify({ error: "Upstream request failed" })),
                    isFinal: true,
                    statusCode: 502,
                    headers: {},
                    sanitized: false,
                    malwareDetected: false,
                    quarantined: false,
                    threatsFound: [],
                    quarantineReason: "",
                    policyReason: "upstream_error",
                    resolvedIp: "",
                });
                call.end();
            }
        },
    };
    server.addService(cyberProto.CyberProxyService.service, serviceImpl);
    return server;
}
//# sourceMappingURL=service.js.map
