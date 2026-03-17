import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { dirname, resolve } from "node:path";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { loadGrpcTlsConfig, loadServiceClientSecurePooled, createGrpcServer, CircuitBreaker, mapleLog } from "@maple/common";
import { checkUrl, scanContent, scanContentForInjection } from "./ssrf-guard.js";
import { config } from "./config.js";
import { scanDownloadedContent } from "../../../shared/packages/maple-security/src/download-scan.js";
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
async function emitAuditEvent(opts, { required = false } = {}) {
    try {
        await auditWriterBreaker.execute(() => grpcUnaryPromise(getAuditWriter(), "appendEvent", {
            event: {
                eventId: randomUUID(),
                eventType: opts.eventType,
                timestamp: new Date().toISOString(),
                sourceService: "cyber-proxy",
                payloadJson: Buffer.from(JSON.stringify(opts.payload ?? {})),
                severity: "RISK_SEVERITY_MEDIUM",
                summary: opts.summary,
            },
        }));
    }
    catch (error) {
        if (required || String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production") {
            throw error;
        }
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
function normalizeRequestBody(body) {
    if (!body) {
        return undefined;
    }
    if (typeof body === "string") {
        const trimmed = body.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            return body;
        }
        if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
            try {
                const decoded = Buffer.from(trimmed, "base64");
                const decodedText = decoded.toString("utf8").trim();
                if (decodedText.startsWith("{") || decodedText.startsWith("[")) {
                    return decoded;
                }
            }
            catch {
                // Fall through to the original raw string handling.
            }
        }
        return body;
    }
    if (Buffer.isBuffer(body)) {
        return body;
    }
    if (body instanceof Uint8Array) {
        return Buffer.from(body);
    }
    if (Array.isArray(body)) {
        return Buffer.from(body);
    }
    if (typeof body === "object" && Array.isArray(body.data)) {
        return Buffer.from(body.data);
    }
    return undefined;
}
function describeRequestBody(body) {
    if (body === undefined || body === null) {
        return { kind: "empty" };
    }
    if (typeof body === "string") {
        return { kind: "string", length: body.length, preview: body.slice(0, 120) };
    }
    if (Buffer.isBuffer(body)) {
        return { kind: "buffer", length: body.length, preview: body.toString("utf8", 0, 120) };
    }
    if (body instanceof Uint8Array) {
        return { kind: "uint8array", length: body.byteLength, preview: Buffer.from(body).toString("utf8", 0, 120) };
    }
    if (Array.isArray(body)) {
        return { kind: "array", length: body.length, preview: JSON.stringify(body.slice(0, 12)) };
    }
    if (typeof body === "object") {
        const keys = Object.keys(body);
        return {
            kind: "object",
            keys,
            preview: JSON.stringify(body).slice(0, 160),
        };
    }
    return { kind: typeof body };
}
/**
 * Verify an HMAC-signed credential token from mcp-proxy.
 * The token format is: credentialId:appId:toolName:timestamp:sortedScopes:signature
 * Scopes are cryptographically bound to the token, so the caller cannot tamper
 * with the x-maple-credential-scopes header independently.
 */
function verifyCredentialToken(token, claimedScopes) {
    if (!token || typeof token !== "string") return { valid: false, reason: "missing_token" };
    const signingKey = process.env.MAPLE_CREDENTIAL_SIGNING_KEY;
    if (!signingKey) return { valid: false, reason: "no_signing_key" };
    const separatorCount = (token.match(/:/g) || []).length;
    if (separatorCount < 5) return { valid: false, reason: "malformed_token" };
    const lastColon = token.lastIndexOf(":");
    if (lastColon <= 0 || lastColon === token.length - 1) {
        return { valid: false, reason: "malformed_token" };
    }
    const signature = token.slice(lastColon + 1);
    const payload = token.slice(0, lastColon);
    const expectedSig = createHmac("sha256", signingKey)
        .update(payload).digest("hex");
    // Constant-time comparison prevents timing attacks
    const sigBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
        return { valid: false, reason: "invalid_signature" };
    }
    const [credentialId, appId, toolName, timestampStr, ...scopeParts] = payload.split(":");
    if (!credentialId || !appId || !toolName || !timestampStr || scopeParts.length === 0) {
        return { valid: false, reason: "malformed_token" };
    }
    const timestamp = Number(timestampStr);
    if (Date.now() - timestamp > 3600_000) return { valid: false, reason: "expired" };
    // Extract signed scopes (between timestamp and signature)
    const signedScopes = scopeParts.join(":");
    // Verify claimed scopes match signed scopes — prevents scope widening attacks
    if (claimedScopes) {
        const claimedSorted = [...claimedScopes].sort().join(",");
        if (claimedSorted !== signedScopes) {
            return { valid: false, reason: "scope_mismatch" };
        }
    }
    return { valid: true, credentialId, appId, toolName, timestamp, scopes: signedScopes };
}

function parseCredentialScopes(headers) {
    const token = getHeaderIgnoreCase(headers, "x-maple-credential-token") ?? "";
    const rawScopes = getHeaderIgnoreCase(headers, "x-maple-credential-scopes") ?? "";

    // Scopes require a valid token with matching signed scopes (fail-closed).
    // Raw scope headers without a token, or with mismatched scopes, are rejected.
    if (rawScopes) {
        if (!token) {
            mapleLog("warn", "cyber_proxy_scope_without_token", {});
            return { allowedDomains: [], maxBytes: undefined, allowFileDownload: true };
        }
        const scopeList = rawScopes.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
        const verification = verifyCredentialToken(token, scopeList);
        if (!verification.valid) {
            mapleLog("warn", "cyber_proxy_credential_rejected", {
                reason: verification.reason,
            });
            return { allowedDomains: [], maxBytes: undefined, allowFileDownload: true };
        }
    } else if (token) {
        // Token present but no scopes header — verify token is valid, use empty scopes
        const verification = verifyCredentialToken(token);
        if (!verification.valid) {
            mapleLog("warn", "cyber_proxy_credential_rejected", { reason: verification.reason });
            return { allowedDomains: [], maxBytes: undefined, allowFileDownload: true };
        }
    }

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
async function buildDownloadScan(options = {}) {
    return scanDownloadedContent({
        provider: config.downloadScanProvider,
        virustotalApiKey: config.virustotalApiKey,
        virustotalApiUrl: config.virustotalApiUrl,
        timeoutMs: config.downloadScanTimeoutMs,
        ...options,
    });
}
function attachScanHeaders(headers, scan) {
    if (!scan || typeof scan !== "object") {
        return headers;
    }
    return {
        ...headers,
        "x-maple-scan-provider": String(scan.provider || ""),
        "x-maple-scan-status": String(scan.status || ""),
        "x-maple-scan-verdict": String(scan.verdict || ""),
        "x-maple-scan-sha256": String(scan.sha256 || ""),
        "x-maple-scan-checked-at": String(scan.checkedAt || ""),
    };
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
        async ScanContent(call, callback) {
            try {
                const content = call.request.content || Buffer.alloc(0);
                const contentType = call.request.contentType || "text/plain";
                const sourceUrl = call.request.sourceUrl || "";
                const result = scanContent(Buffer.from(content), contentType, sourceUrl || undefined);
                const scan = await buildDownloadScan({
                    content,
                    contentType,
                    sourceUrl,
                    localResult: result,
                });
                if (result.quarantined || scan.quarantined || scan.blocked) {
                    await emitAuditEvent({
                        eventType: "AUDIT_EVENT_TYPE_CONTENT_SCANNED",
                        summary: `Content quarantined: ${result.quarantineReason}`,
                        payload: { sourceUrl, threats: result.threats, quarantineReason: result.quarantineReason, scan },
                    }, { required: true });
                }
                callback(null, {
                    safe: result.safe, threatsFound: result.threats,
                    sanitizedContent: result.sanitized,
                    scanSummary: JSON.stringify(scan),
                    quarantined: result.quarantined || scan.quarantined || scan.blocked,
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
                    await emitAuditEvent({
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
                    }, { required: true });
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
                    const requestBody = normalizeRequestBody(body);
                    if (requestBody === undefined) {
                        mapleLog("warn", "cyber_proxy_request_body_unparsed", {
                            url,
                            method: method || "GET",
                            bodyShape: describeRequestBody(body),
                        });
                    }
                    const resp = await fetch(url, {
                        method: method || "GET",
                        headers: sanitizeOutboundHeaders(inboundHeaders),
                        body: method !== "GET" && method !== "HEAD" ? requestBody : undefined,
                        signal: controller.signal,
                    });
                    clearTimeout(timer);
                    // Read response body incrementally with size enforcement to
                    // prevent OOM from large upstream responses.
                    const chunks = [];
                    let totalBytes = 0;
                    let sizeExceeded = false;
                    const reader = resp.body?.getReader();
                    if (reader) {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            totalBytes += value.byteLength;
                            if (totalBytes > effectiveMaxBytes) {
                                reader.cancel();
                                sizeExceeded = true;
                                break;
                            }
                            chunks.push(value);
                        }
                    } else {
                        const buf = Buffer.from(await resp.arrayBuffer());
                        totalBytes = buf.length;
                        if (totalBytes > effectiveMaxBytes) sizeExceeded = true;
                        else chunks.push(buf);
                    }
                    const respBody = Buffer.concat(chunks);
                    const respHeaders = {};
                    resp.headers.forEach((v, k) => { respHeaders[k] = v; });
                    if (resp.status >= 400) {
                        mapleLog("warn", "cyber_proxy_upstream_http_error", {
                            url,
                            method: method || "GET",
                            statusCode: resp.status,
                            requestBodyShape: describeRequestBody(body),
                            requestBodyBytes: requestBody
                                ? Buffer.isBuffer(requestBody)
                                    ? requestBody.length
                                    : Buffer.byteLength(String(requestBody))
                                : 0,
                            responsePreview: respBody.toString("utf8", 0, 240),
                        });
                    }
                    if (sizeExceeded) {
                        const reason = `Response exceeds scoped max_bytes (${totalBytes} > ${effectiveMaxBytes})`;
                        await emitAuditEvent({
                            eventType: "AUDIT_EVENT_TYPE_CONTENT_SCANNED",
                            summary: reason,
                            payload: { url, appId: call.request.appId || "", toolName, scopedMaxBytes: effectiveMaxBytes },
                        }, { required: true });
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
                        await emitAuditEvent({
                            eventType: "AUDIT_EVENT_TYPE_CONTENT_SCANNED",
                            summary: reason,
                            payload: { url, appId: call.request.appId || "", toolName, contentType },
                        }, { required: true });
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
                    const scan = await buildDownloadScan({
                        content: respBody,
                        contentType,
                        sourceUrl: url,
                        localResult: scanResult,
                    });
                    const respHeadersWithScan = attachScanHeaders(respHeaders, scan);
                    if (scanResult.quarantined || scan.quarantined || scan.blocked) {
                        mapleLog("warn", "cyber_proxy_content_quarantined", { url, reason: scanResult.quarantineReason, threats: scanResult.threats });
                        await emitAuditEvent({
                            eventType: "AUDIT_EVENT_TYPE_CONTENT_SCANNED",
                            summary: `Download quarantined: ${scanResult.quarantineReason}`,
                            payload: { url, reason: scanResult.quarantineReason, threats: scanResult.threats, scan },
                        }, { required: true });
                        callback(null, {
                            statusCode: 403,
                            headers: respHeadersWithScan,
                            body: Buffer.from(JSON.stringify({ error: "Download quarantined", reason: scanResult.quarantineReason, threats: scanResult.threats, scan })),
                            durationMs: Date.now() - start,
                            resolvedIp: urlCheck.resolvedIp,
                            sanitized: false,
                            malwareDetected: scan.verdict === "malicious",
                            quarantined: true,
                            threatsFound: [...new Set([...(scanResult.threats ?? []), ...(scan.reasons ?? [])])],
                            quarantineReason: scanResult.quarantineReason || scan.reasons?.[0] || "",
                            policyReason: scanResult.quarantineReason || "content_quarantined",
                        });
                        return;
                    }
                    if (!scanResult.safe) {
                        mapleLog("warn", "cyber_proxy_content_blocked", { url, threats: scanResult.threats });
                        callback(null, {
                            statusCode: 403,
                            headers: respHeadersWithScan,
                            body: Buffer.from(JSON.stringify({ error: "Response content blocked", threats: scanResult.threats, scan })),
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
                    // Indirect prompt injection scanning (fail-open: tag, don't block)
                    const injectionScan = scanContentForInjection(respBody, contentType);
                    if (injectionScan.hasInjection && injectionScan.confidence >= 0.7) {
                        respHeaders["x-maple-injection-detected"] = "true";
                        respHeaders["x-maple-injection-confidence"] = String(injectionScan.confidence.toFixed(2));
                        emitAuditEvent({
                            eventType: "AUDIT_EVENT_TYPE_CONTENT_SCANNED",
                            summary: `Indirect prompt injection detected in fetched content (confidence ${(injectionScan.confidence * 100).toFixed(0)}%)`,
                            payload: { url, patterns: injectionScan.patterns, categories: injectionScan.categories, confidence: injectionScan.confidence },
                        });
                    }
                    // Use sanitized content if available
                    const finalBody = scanResult.sanitized.length > 0 ? scanResult.sanitized : respBody;
                    callback(null, {
                        statusCode: resp.status,
                        headers: respHeadersWithScan,
                        body: finalBody,
                        durationMs: Date.now() - start,
                        resolvedIp: urlCheck.resolvedIp,
                        sanitized: finalBody !== respBody,
                        malwareDetected: false,
                        quarantined: false,
                        threatsFound: injectionScan.hasInjection ? [`indirect_injection:${injectionScan.patterns.join(",")}`] : [],
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
                const scan = await buildDownloadScan({
                    content: respBody,
                    contentType,
                    sourceUrl: url,
                    localResult: scanResult,
                });
                const respHeadersWithScan = attachScanHeaders(respHeaders, scan);
                if (scanResult.quarantined || scan.quarantined || scan.blocked) {
                    emitAuditEvent({
                        eventType: "AUDIT_EVENT_TYPE_CONTENT_SCANNED",
                        summary: `Stream download quarantined: ${scanResult.quarantineReason}`,
                        payload: { url, reason: scanResult.quarantineReason, threats: scanResult.threats, scan },
                    });
                    call.write({
                        data: Buffer.from(JSON.stringify({ error: "Download quarantined", reason: scanResult.quarantineReason, threats: scanResult.threats, scan })),
                        isFinal: true,
                        statusCode: 403,
                        headers: respHeadersWithScan,
                        sanitized: false,
                        malwareDetected: scan.verdict === "malicious",
                        quarantined: true,
                        threatsFound: [...new Set([...(scanResult.threats ?? []), ...(scan.reasons ?? [])])],
                        quarantineReason: scanResult.quarantineReason || scan.reasons?.[0] || "",
                        policyReason: scanResult.quarantineReason || "content_quarantined",
                        resolvedIp: urlCheck.resolvedIp,
                    });
                    call.end();
                    return;
                }
                if (!scanResult.safe) {
                    call.write({
                        data: Buffer.from(JSON.stringify({ error: "Response content blocked", threats: scanResult.threats, scan })),
                        isFinal: true,
                        statusCode: 403,
                        headers: respHeadersWithScan,
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
                try {
                    call.write({
                        data: finalBody,
                        isFinal: true,
                        statusCode: resp.status,
                        headers: respHeadersWithScan,
                        sanitized: finalBody !== respBody,
                        malwareDetected: false,
                        quarantined: false,
                        threatsFound: [],
                        quarantineReason: "",
                        policyReason: "ok",
                        resolvedIp: urlCheck.resolvedIp,
                    });
                } catch { /* client disconnected */ }
                call.end();
            }
            catch {
                try {
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
                } catch { /* client disconnected */ }
                call.end();
            }
        },
    };
    server.addService(cyberProto.CyberProxyService.service, serviceImpl);
    return server;
}
//# sourceMappingURL=service.js.map
