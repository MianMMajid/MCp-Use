import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { loadGrpcTlsConfig, loadServiceClientSecure, mapleLog } from "@maple/common";
import { config } from "./config.js";
const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
const PROTO_PATH = resolve(PROTO_ROOT, "maple/secrets/v1/secrets_broker.proto");
const grpcTlsConfig = loadGrpcTlsConfig();
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
    includeDirs: [PROTO_ROOT, resolve(PROTO_ROOT, "maple"), dirname(PROTO_PATH)],
});
const proto = grpc.loadPackageDefinition(packageDefinition);
const secretsProto = proto.maple.secrets.v1;
function loadServiceClient(protoFile, servicePath, address) {
    return loadServiceClientSecure(protoFile, servicePath, address, PROTO_ROOT, grpcTlsConfig);
}
function grpcUnary(client, method, request) {
    return new Promise((resolvePromise, rejectPromise) => {
        client[method](request, (err, response) => {
            if (err)
                rejectPromise(err);
            else
                resolvePromise(response);
        });
    });
}
let auditWriterClient;
function closeGrpcClient(client) {
    if (!client || typeof client.close !== "function") {
        return;
    }
    try {
        client.close();
    }
    catch {
        // best effort
    }
}
function getAuditWriter() {
    if (!auditWriterClient) {
        auditWriterClient = loadServiceClient("maple/audit/v1/audit_writer.proto", "maple.audit.v1.AuditWriterService", config.auditWriterAddress);
    }
    return auditWriterClient;
}
export function closeSecretsBrokerClients() {
    closeGrpcClient(auditWriterClient);
    auditWriterClient = undefined;
}
function emitAuditEvent(opts) {
    try {
        grpcUnary(getAuditWriter(), "appendEvent", {
            event: {
                eventId: randomUUID(),
                eventType: opts.eventType,
                timestamp: new Date().toISOString(),
                sourceService: "secrets-broker",
                context: { traceId: opts.traceId ?? "" },
                payloadJson: Buffer.from(JSON.stringify(opts.payload ?? {})),
                severity: opts.severity ?? "RISK_SEVERITY_LOW",
                summary: opts.summary,
            },
        }).catch((err) => {
            mapleLog("warn", "secrets_broker_audit_emit_failed", { error: err.message });
        });
    }
    catch {
        // fire-and-forget
    }
}
export function createSecretsBrokerService(store) {
    const server = new grpc.Server();
    const serviceImpl = {
        MintCredential(call, callback) {
            try {
                const req = call.request;
                const ttl = Math.min(req.ttlSeconds || config.defaultTtlSeconds, config.maxTtlSeconds);
                const cred = store.mint(req.toolName, req.appId, req.scopes || [], ttl, req.context?.userId || "system");
                mapleLog("info", "credential_minted", { credentialId: cred.credentialId, toolName: cred.toolName, ttl });
                emitAuditEvent({
                    eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
                    summary: `Credential minted for ${cred.appId}.${cred.toolName}`,
                    traceId: req.context?.traceId,
                    payload: { credentialId: cred.credentialId, appId: cred.appId, toolName: cred.toolName, ttl },
                });
                callback(null, {
                    credential: {
                        credentialId: cred.credentialId, toolName: cred.toolName, appId: cred.appId,
                        scopes: cred.scopes, issuedAt: cred.issuedAt, expiresAt: cred.expiresAt,
                        status: "CREDENTIAL_STATUS_ACTIVE", issuedBy: cred.issuedBy,
                    },
                    token: cred.token,
                });
            }
            catch (err) {
                emitAuditEvent({
                    eventType: "AUDIT_EVENT_TYPE_TOOL_FAILED",
                    summary: "Credential mint failed",
                    severity: "RISK_SEVERITY_MEDIUM",
                    payload: { error: err.message },
                });
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        RevokeCredential(call, callback) {
            try {
                const revoked = store.revoke(call.request.credentialId);
                mapleLog("info", "credential_revoked", { credentialId: call.request.credentialId, revoked });
                emitAuditEvent({
                    eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
                    summary: `Credential revoke requested: ${call.request.credentialId}`,
                    payload: { credentialId: call.request.credentialId, revoked },
                });
                callback(null, { revoked, credentialId: call.request.credentialId });
            }
            catch (err) {
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        GetCredentialStatus(call, callback) {
            try {
                const cred = store.get(call.request.credentialId);
                if (!cred) {
                    callback({ code: grpc.status.NOT_FOUND, message: "Credential not found" });
                    return;
                }
                callback(null, {
                    credential: {
                        credentialId: cred.credentialId, toolName: cred.toolName, appId: cred.appId,
                        scopes: cred.scopes, issuedAt: cred.issuedAt, expiresAt: cred.expiresAt,
                        status: cred.status === "active" ? "CREDENTIAL_STATUS_ACTIVE" : cred.status === "expired" ? "CREDENTIAL_STATUS_EXPIRED" : "CREDENTIAL_STATUS_REVOKED",
                        issuedBy: cred.issuedBy,
                    },
                });
            }
            catch (err) {
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
        ListActiveCredentials(call, callback) {
            try {
                const creds = store.listActive(call.request.appId || undefined, call.request.toolName || undefined);
                callback(null, {
                    credentials: creds.map((c) => ({
                        credentialId: c.credentialId, toolName: c.toolName, appId: c.appId,
                        scopes: c.scopes, issuedAt: c.issuedAt, expiresAt: c.expiresAt,
                        status: "CREDENTIAL_STATUS_ACTIVE", issuedBy: c.issuedBy,
                    })),
                });
            }
            catch (err) {
                callback({ code: grpc.status.INTERNAL, message: err.message });
            }
        },
    };
    server.addService(secretsProto.SecretsBrokerService.service, serviceImpl);
    return server;
}
//# sourceMappingURL=service.js.map
