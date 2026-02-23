/**
 * MCP Proxy Service
 *
 * This service acts as the tool execution layer for Maple's microservice
 * architecture. In the current design, mcp-proxy directly executes tool calls
 * against downstream MCP servers by delegating execution to the tool-runner
 * plane with two security enforcement layers:
 *
 * 1. **secrets-broker**: Before each tool execution, a short-lived scoped
 *    credential is minted via gRPC. This ensures every tool invocation has
 *    an auditable credential with bounded TTL and explicit scopes.
 *
 * 2. **tool-runner + cyber-proxy**: mcp-proxy forwards execution requests to
 *    tool-runner, which routes all outbound traffic through cyber-proxy for
 *    SSRF guards, domain allowlists/blocklists, and content scanning.
 */
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { resolve } from "node:path";
import { loadGrpcTlsConfig, loadServiceClientSecure, mapleLog } from "@maple/common";
import { randomUUID } from "node:crypto";
import { DownstreamRegistry } from "./downstream-registry.js";
import { config } from "./config.js";
import type { K8sJobDispatcher } from "./k8s-job-dispatcher.js";

// ── Lightweight audit event emitter ──────────────────────────────────────────

function emitAuditEvent(opts: { eventType: string; summary: string; traceId?: string; payload?: Record<string, unknown> }): void {
  try {
    const client = loadServiceClient(
      "maple/audit/v1/audit_writer.proto",
      "maple.audit.v1.AuditWriterService",
      config.auditWriterAddress,
    );
    grpcUnary(client, "appendEvent", {
      event: {
        eventId: randomUUID(),
        eventType: opts.eventType,
        timestamp: new Date().toISOString(),
        sourceService: "mcp-proxy",
        context: { traceId: opts.traceId ?? "" },
        payloadJson: Buffer.from(JSON.stringify(opts.payload ?? {})),
        severity: "RISK_SEVERITY_LOW",
        summary: opts.summary,
      },
    }).catch((err) => {
      mapleLog("warn", "audit_emit_failed", { error: (err as Error).message });
    });
  } catch {
    // Audit emission is fire-and-forget
  }
}

// ── gRPC clients for secrets-broker and tool-runner ──────────────────────────

const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
const grpcTlsConfig = loadGrpcTlsConfig();

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
  return new Promise((resolve, reject) => {
    client[method](request, (err: grpc.ServiceError | null, response: T) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

let secretsBrokerClient: any;
let toolRunnerClient: any;

function getSecretsBroker(): any {
  if (!secretsBrokerClient) {
    secretsBrokerClient = loadServiceClient(
      "maple/secrets/v1/secrets_broker.proto",
      "maple.secrets.v1.SecretsBrokerService",
      config.secretsBrokerAddress,
    );
  }
  return secretsBrokerClient;
}

function getToolRunner(): any {
  if (!toolRunnerClient) {
    toolRunnerClient = loadServiceClient(
      "maple/tools/v1/tool_runner.proto",
      "maple.tools.v1.ToolRunnerService",
      config.toolRunnerAddress,
    );
  }
  return toolRunnerClient;
}

interface MintedCredential {
  credentialId: string;
  token: string;
  scopes: string[];
}

function scopeToCredentialScopes(scope: any): string[] {
  const scopes: string[] = ["execute"];
  if (scope?.allowedDomains && Array.isArray(scope.allowedDomains) && scope.allowedDomains.length > 0) {
    for (const domain of scope.allowedDomains) {
      scopes.push(`domain:${domain}`);
    }
  }
  if (scope?.maxBytes && Number(scope.maxBytes) > 0) {
    scopes.push(`max_bytes:${Math.trunc(Number(scope.maxBytes))}`);
  }
  if (scope?.allowFileDownload === false) {
    scopes.push("download:blocked");
  }
  return [...new Set(scopes)];
}

async function mintCredentialForToolWithScopes(
  toolName: string,
  appId: string,
  scopes: string[],
): Promise<MintedCredential | null> {
  try {
    const response = await grpcUnary<any>(getSecretsBroker(), "mintCredential", {
      toolName,
      appId,
      scopes,
      ttlSeconds: 300,
    });
    const credentialId = response?.credential?.credentialId ?? "";
    const token = response?.token ? String(response.token) : "";
    if (credentialId) {
      mapleLog("info", "credential_minted", { toolName, appId, credentialId });
      return { credentialId, token, scopes };
    }
    return null;
  } catch (err: any) {
    mapleLog("warn", "credential_mint_failed", { toolName, appId, error: err.message });
    return null;
  }
}

let jobDispatcher: K8sJobDispatcher | null = null;

function setJobDispatcher(dispatcher: K8sJobDispatcher | null): void {
  jobDispatcher = dispatcher;
}

async function dispatchViaToolRunner(
  appId: string,
  url: string,
  body: unknown,
  timeoutMs: number,
  traceId?: string,
  credential?: MintedCredential | null,
): Promise<unknown> {
  // Job mode: dispatch as isolated K8s Job
  if (config.toolRunnerMode === "job" && jobDispatcher) {
    try {
      const result = await jobDispatcher.dispatch({
        appId,
        targetUrl: url,
        payloadJson: JSON.stringify(body),
        timeoutMs,
        traceId,
        credentialId: credential?.credentialId ?? "",
        credentialToken: credential?.token ?? "",
        credentialScopes: credential?.scopes ?? [],
      });
      if (!result.success) {
        throw new Error(result.errorMessage || `Job returned failure status ${result.statusCode}`);
      }
      return JSON.parse(result.responseJson);
    } catch (err: any) {
      mapleLog("warn", "k8s_job_dispatch_failed", { appId, url, error: err.message });
      throw err;
    }
  }

  // Service mode: use persistent tool-runner gRPC service
  try {
    const response = await grpcUnary<any>(getToolRunner(), "executeJsonRpc", {
      context: {
        traceId: traceId || "",
        sourceService: "mcp-proxy",
      },
      appId,
      targetUrl: url,
      payloadJson: Buffer.from(JSON.stringify(body)),
      timeoutMs,
      credentialId: credential?.credentialId ?? "",
      credentialToken: credential?.token ?? "",
      credentialScopes: credential?.scopes ?? [],
    });
    if (!response?.success) {
      throw new Error(response?.errorMessage || `tool-runner returned failure status ${response?.statusCode ?? "unknown"}`);
    }
    const responseRaw = response?.responseJson;
    const responseJson = responseRaw
      ? (typeof responseRaw === "string" ? responseRaw : Buffer.from(responseRaw).toString("utf-8"))
      : "{}";
    return JSON.parse(responseJson);
  } catch (err: any) {
    mapleLog("warn", "tool_runner_dispatch_failed", { appId, url, error: err.message });
    throw err;
  }
}

function resolveTargetUrl(registry: DownstreamRegistry, appId: string, targetUrl?: string): { url: string; appEnabled: boolean } {
  const app = registry.get(appId);
  const explicitTargetUrl = String(targetUrl || "").trim();
  if (explicitTargetUrl.length > 0) {
    return {
      url: explicitTargetUrl,
      appEnabled: app ? app.enabled : true,
    };
  }
  if (!app) {
    throw new Error(`App ${appId} not found`);
  }
  return {
    url: app.url,
    appEnabled: app.enabled,
  };
}

const PROTO_PATH = resolve(import.meta.dirname, "../../../../proto/maple/proxy/v1/mcp_proxy.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
  includeDirs: [resolve(import.meta.dirname, "../../../../proto")],
});

const proto = grpc.loadPackageDefinition(packageDefinition) as any;
const proxyProto = proto.maple.proxy.v1;

export function createMcpProxyService(registry: DownstreamRegistry, dispatcher?: K8sJobDispatcher): grpc.Server {
  if (dispatcher) setJobDispatcher(dispatcher);
  const server = new grpc.Server();

  const serviceImpl = {
    async ExecuteTool(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      try {
        const { appId, toolName, argumentsJson, sessionId, traceId, targetUrl } = call.request;
        const target = resolveTargetUrl(registry, appId, targetUrl);
        if (!target.appEnabled) {
          callback({ code: grpc.status.FAILED_PRECONDITION, message: `App ${appId} is disabled` });
          return;
        }

        const start = Date.now();
        mapleLog("info", "tool_execute", { appId, toolName, sessionId, traceId });

        // Mint a short-lived scoped credential before execution (non-blocking).
        const requestedScope = call.request.scope;
        const mintedCredential = await mintCredentialForToolWithScopes(
          toolName,
          appId,
          scopeToCredentialScopes(requestedScope),
        );

        // Parse the arguments from the gRPC request
        let toolArgs: Record<string, unknown> = {};
        if (argumentsJson) {
          try {
            const raw = typeof argumentsJson === "string"
              ? argumentsJson
              : Buffer.isBuffer(argumentsJson)
                ? argumentsJson.toString("utf-8")
                : String(argumentsJson);
            toolArgs = JSON.parse(raw);
          } catch {
            callback({ code: grpc.status.INVALID_ARGUMENT, message: "Invalid argumentsJson: not valid JSON" });
            return;
          }
        }

        // Build MCP JSON-RPC tools/call request
        const jsonRpcRequest = {
          jsonrpc: "2.0",
          id: traceId || `tool-${appId}-${Date.now()}`,
          method: "tools/call",
          params: {
            name: toolName,
            arguments: toolArgs,
          },
        };

        // Validate scope if present
        if (requestedScope) {
          const scope = requestedScope;
          if (scope.allowedDomains && scope.allowedDomains.length > 0) {
            try {
              const targetHost = new URL(target.url).hostname;
              const domainAllowed = scope.allowedDomains.some((d: string) =>
                targetHost === d || targetHost.endsWith(`.${d}`)
              );
              if (!domainAllowed) {
                callback({ code: grpc.status.PERMISSION_DENIED, message: `Target domain ${targetHost} is not in allowed scope: ${scope.allowedDomains.join(", ")}` });
                return;
              }
            } catch {
              // URL parse failure — allow through to cyber-proxy for enforcement
            }
          }
        }

        // Route all tool execution through tool-runner.
        let response: unknown;
        try {
          response = await dispatchViaToolRunner(
            appId,
            target.url,
            jsonRpcRequest,
            config.toolExecutionTimeoutMs,
            traceId,
            mintedCredential,
          );
          mapleLog("debug", "tool_execute_via_tool_runner", { appId, toolName, targetUrl: target.url });
        } catch (proxyErr: any) {
          mapleLog("error", "tool_execute_tool_runner_unavailable", { appId, toolName, targetUrl: target.url, error: proxyErr.message });
          callback({ code: grpc.status.UNAVAILABLE, message: `Tool-runner unreachable: ${proxyErr.message}` });
          return;
        }

        const durationMs = Date.now() - start;
        const rpcResponse = response as Record<string, unknown> | undefined;

        // Check for JSON-RPC error in the response
        if (rpcResponse?.error) {
          mapleLog("warn", "tool_execute_rpc_error", { appId, toolName, error: rpcResponse.error });
          emitAuditEvent({
            eventType: "AUDIT_EVENT_TYPE_TOOL_FAILED",
            summary: `Tool ${toolName} on ${appId} failed`,
            traceId,
            payload: { appId, toolName, durationMs, error: rpcResponse.error },
          });
          callback(null, {
            success: false,
            resultJson: Buffer.from(JSON.stringify(rpcResponse.error)),
            durationMs,
            appId,
            toolName,
          });
          return;
        }

        emitAuditEvent({
          eventType: "AUDIT_EVENT_TYPE_TOOL_COMPLETED",
          summary: `Tool ${toolName} on ${appId} completed in ${durationMs}ms`,
          traceId,
          payload: { appId, toolName, durationMs },
        });
        callback(null, {
          success: true,
          resultJson: Buffer.from(JSON.stringify(rpcResponse?.result ?? {})),
          durationMs,
          appId,
          toolName,
        });
      } catch (err: any) {
        mapleLog("error", "tool_execute_failed", { error: err.message });
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async ExecuteToolChain(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      try {
        const { appIds, toolName, argumentsJson, traceId } = call.request;
        mapleLog("info", "tool_chain_execute", { appIds, toolName, traceId });

        // Parse shared arguments
        let toolArgs: Record<string, unknown> = {};
        if (argumentsJson) {
          try {
            const raw = typeof argumentsJson === "string"
              ? argumentsJson
              : Buffer.isBuffer(argumentsJson)
                ? argumentsJson.toString("utf-8")
                : String(argumentsJson);
            toolArgs = JSON.parse(raw);
          } catch {
            callback({ code: grpc.status.INVALID_ARGUMENT, message: "Invalid argumentsJson: not valid JSON" });
            return;
          }
        }

        const results: Array<{
          success: boolean;
          resultJson: Buffer;
          durationMs: number;
          appId: string;
          toolName: string;
        }> = [];
        let chainSuccess = true;

        // Dispatch sequentially through each app in the chain
        for (const appId of appIds || []) {
          const app = registry.get(appId);
          if (!app) {
            results.push({
              success: false,
              resultJson: Buffer.from(JSON.stringify({ error: `App ${appId} not found` })),
              durationMs: 0,
              appId,
              toolName,
            });
            chainSuccess = false;
            continue;
          }

          if (!app.enabled) {
            results.push({
              success: false,
              resultJson: Buffer.from(JSON.stringify({ error: `App ${appId} is disabled` })),
              durationMs: 0,
              appId,
              toolName,
            });
            chainSuccess = false;
            continue;
          }

          const start = Date.now();

          try {
            const mintedCredential = await mintCredentialForToolWithScopes(
              toolName,
              appId,
              ["execute", "chain"],
            );
            const jsonRpcRequest = {
              jsonrpc: "2.0",
              id: `chain-${appId}-${Date.now()}`,
              method: "tools/call",
              params: {
                name: toolName,
                arguments: toolArgs,
              },
            };

            const response = await dispatchViaToolRunner(
              appId,
              app.url,
              jsonRpcRequest,
              config.toolExecutionTimeoutMs,
              traceId,
              mintedCredential,
            );

            const durationMs = Date.now() - start;
            const rpcResponse = response as Record<string, unknown> | undefined;

            if (rpcResponse?.error) {
              results.push({
                success: false,
                resultJson: Buffer.from(JSON.stringify(rpcResponse.error)),
                durationMs,
                appId,
                toolName,
              });
              chainSuccess = false;
            } else {
              results.push({
                success: true,
                resultJson: Buffer.from(JSON.stringify(rpcResponse?.result ?? {})),
                durationMs,
                appId,
                toolName,
              });
            }
          } catch (err: any) {
            const durationMs = Date.now() - start;
            mapleLog("error", "tool_chain_step_failed", { appId, toolName, error: err.message });
            results.push({
              success: false,
              resultJson: Buffer.from(JSON.stringify({ error: err.message })),
              durationMs,
              appId,
              toolName,
            });
            chainSuccess = false;
          }
        }

        emitAuditEvent({
          eventType: chainSuccess ? "AUDIT_EVENT_TYPE_TOOL_COMPLETED" : "AUDIT_EVENT_TYPE_TOOL_FAILED",
          summary: `Tool chain ${toolName} ${chainSuccess ? "completed" : "failed"}`,
          traceId,
          payload: {
            toolName,
            appCount: Array.isArray(appIds) ? appIds.length : 0,
            successCount: results.filter((result) => result.success).length,
            failureCount: results.filter((result) => !result.success).length,
          },
        });
        callback(null, { success: chainSuccess, results });
      } catch (err: any) {
        mapleLog("error", "tool_chain_execute_failed", { error: err.message });
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    ListTools(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      try {
        const appId = call.request.appId;
        const tools = appId ? registry.getToolsForApp(appId).map((t) => ({ name: t.name, description: t.description, appId })) : registry.getAllTools();
        callback(null, { tools: tools.map((t) => ({ name: t.name, description: t.description, appId: t.appId })) });
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    ListDownstreamApps(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      try {
        const apps = registry.list(call.request.includeDisabled);
        callback(null, {
          apps: apps.map((a) => ({
            appId: a.appId, name: a.name, url: a.url, transport: a.transport,
            enabled: a.enabled, status: a.status, tools: a.tools.map((t) => ({ name: t.name, description: t.description })),
          })),
        });
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async ForwardJsonRpc(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      try {
        const { appId, payloadJson, targetUrl } = call.request;
        const target = resolveTargetUrl(registry, appId, targetUrl);
        mapleLog("debug", "jsonrpc_forward", { appId, targetUrl: target.url });

        if (!target.appEnabled) {
          callback({ code: grpc.status.FAILED_PRECONDITION, message: `App ${appId} is disabled` });
          return;
        }

        // Parse the incoming JSON-RPC payload
        let payload: unknown;
        try {
          const raw = typeof payloadJson === "string"
            ? payloadJson
            : Buffer.isBuffer(payloadJson)
              ? payloadJson.toString("utf-8")
              : String(payloadJson);
          payload = JSON.parse(raw);
        } catch {
          callback({ code: grpc.status.INVALID_ARGUMENT, message: "Invalid payloadJson: not valid JSON" });
          return;
        }

        const mintedCredential = await mintCredentialForToolWithScopes(
          "jsonrpc.forward",
          appId,
          ["execute", "forward_jsonrpc"],
        );
        const response = await dispatchViaToolRunner(
          appId,
          target.url,
          payload,
          config.toolExecutionTimeoutMs,
          call.request.context?.traceId,
          mintedCredential,
        );

        emitAuditEvent({
          eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
          summary: `ForwardJsonRpc completed for ${appId}`,
          traceId: call.request.context?.traceId,
          payload: { appId, targetUrl: target.url },
        });
        callback(null, {
          responseJson: Buffer.from(JSON.stringify(response ?? { jsonrpc: "2.0", id: null, result: null })),
          success: true,
        });
      } catch (err: any) {
        mapleLog("error", "jsonrpc_forward_failed", { error: err.message });
        emitAuditEvent({
          eventType: "AUDIT_EVENT_TYPE_TOOL_FAILED",
          summary: `ForwardJsonRpc failed for ${call.request?.appId || "unknown-app"}`,
          traceId: call.request?.context?.traceId,
          payload: { appId: call.request?.appId || "", error: err.message },
        });
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    PingDownstream(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      try {
        const app = registry.get(call.request.appId);
        callback(null, { reachable: !!app && app.enabled, latencyMs: 0, status: app?.status || "unknown" });
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },
  };

  server.addService(proxyProto.McpProxyService.service, serviceImpl);
  return server;
}
