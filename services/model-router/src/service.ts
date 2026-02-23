import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { loadGrpcTlsConfig, loadServiceClientSecure, mapleLog } from "@maple/common";
import { config } from "./config.js";
import { generateOpenAI, streamOpenAI } from "./providers/openai.js";
import type { ChatMessage, GenerateOptions, GenerateResult, ToolDefinition, ToolCall } from "./providers/openai.js";
import { generateAnthropic, streamAnthropic } from "./providers/anthropic.js";

const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
const PROTO_PATH = resolve(PROTO_ROOT, "maple/model/v1/model_router.proto");
const grpcTlsConfig = loadGrpcTlsConfig();

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
  includeDirs: [PROTO_ROOT],
});

const proto = grpc.loadPackageDefinition(packageDefinition) as any;
const modelProto = proto.maple.model.v1;

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

let auditWriterClient: any;
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
  traceId?: string;
  severity?: string;
  payload?: Record<string, unknown>;
}): void {
  try {
    grpcUnary(getAuditWriter(), "appendEvent", {
      event: {
        eventId: randomUUID(),
        eventType: opts.eventType,
        timestamp: new Date().toISOString(),
        sourceService: "model-router",
        context: { traceId: opts.traceId ?? "" },
        payloadJson: Buffer.from(JSON.stringify(opts.payload ?? {})),
        severity: opts.severity ?? "RISK_SEVERITY_LOW",
        summary: opts.summary,
      },
    }).catch((err) => {
      mapleLog("warn", "model_router_audit_emit_failed", { error: err.message });
    });
  } catch {
    // fire-and-forget
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type Provider = "openai" | "anthropic";

function getFallbackProvider(primary: Provider): Provider {
  return primary === "openai" ? "anthropic" : "openai";
}

function resolveModelForProvider(provider: Provider, requestedModel?: string): string {
  // If the caller explicitly requested a model, use it
  if (requestedModel) return requestedModel;
  // Otherwise use the configured default for the provider
  return provider === "openai" ? config.openaiModel : config.anthropicModel;
}

function getApiKeyForProvider(provider: Provider): string {
  return provider === "openai" ? config.openaiApiKey : config.anthropicApiKey;
}

function isProviderAvailable(provider: Provider): boolean {
  return getApiKeyForProvider(provider).length > 0;
}

/**
 * Convert proto ChatRole enum values to simple role strings.
 */
function protoMessagesToChatMessages(
  protoMessages: any[],
  systemPrompt?: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  for (const m of protoMessages) {
    const role: ChatMessage["role"] =
      m.role === "CHAT_ROLE_SYSTEM" ? "system"
        : m.role === "CHAT_ROLE_USER" ? "user"
          : m.role === "CHAT_ROLE_ASSISTANT" ? "assistant"
            : m.role === "CHAT_ROLE_TOOL" ? "tool"
              : "user";

    const msg: ChatMessage = { role, content: m.content };
    if (m.name) msg.name = m.name;
    if (m.toolCallId) msg.tool_call_id = m.toolCallId;
    messages.push(msg);
  }

  return messages;
}

/**
 * Call a provider with fallback. If the primary provider fails (or its key is
 * missing), try the other provider automatically.
 */
async function generateWithFallback(
  messages: ChatMessage[],
  requestedModel: string | undefined,
  maxTokens: number | undefined,
  temperature: number | undefined,
  tools?: ToolDefinition[],
): Promise<GenerateResult & { provider: Provider }> {
  const primary = config.primaryProvider;
  const fallback = getFallbackProvider(primary);

  const providers: Provider[] = isProviderAvailable(primary)
    ? [primary, fallback]
    : [fallback]; // Skip primary if no API key

  let lastError: Error | undefined;

  for (const provider of providers) {
    const apiKey = getApiKeyForProvider(provider);
    if (!apiKey) {
      mapleLog("warn", "model_router_skip_provider", { provider, reason: "no_api_key" });
      continue;
    }

    const model = resolveModelForProvider(provider, provider === primary ? requestedModel : undefined);
    const opts: GenerateOptions = {
      model,
      messages,
      maxTokens: maxTokens || config.maxTokens,
      temperature: temperature || undefined,
      timeoutMs: config.chatTimeoutMs,
      tools: tools && tools.length > 0 ? tools : undefined,
    };

    try {
      mapleLog("info", "model_router_calling_provider", { provider, model });
      const generateFn = provider === "openai" ? generateOpenAI : generateAnthropic;
      const result = await generateFn(apiKey, opts);
      return { ...result, provider };
    } catch (err: any) {
      lastError = err;
      mapleLog("warn", "model_router_provider_failed", {
        provider,
        model,
        error: err.message,
      });
      // Continue to fallback
    }
  }

  throw lastError ?? new Error("No LLM providers available. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.");
}

// ── Tool Schema Filtering ────────────────────────────────────────────────────

function filterToolsByAllowedNames(
  tools: ToolDefinition[],
  allowedToolNames: string[],
): { filtered: ToolDefinition[]; strippedNames: string[] } {
  if (!allowedToolNames || allowedToolNames.length === 0) {
    return { filtered: tools, strippedNames: [] };
  }
  const allowedSet = new Set(allowedToolNames);
  const filtered: ToolDefinition[] = [];
  const strippedNames: string[] = [];
  for (const tool of tools) {
    if (allowedSet.has(tool.function.name)) {
      filtered.push(tool);
    } else {
      strippedNames.push(tool.function.name);
    }
  }
  if (strippedNames.length > 0) {
    mapleLog("info", "model_router_tools_filtered", {
      total: tools.length,
      allowed: filtered.length,
      stripped: strippedNames.length,
      strippedNames,
    });
  }
  return { filtered, strippedNames };
}

// ── Service ──────────────────────────────────────────────────────────────────

export function createModelRouterService(): grpc.Server {
  const server = new grpc.Server();

  const serviceImpl = {
    async Generate(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
      try {
        const req = call.request;
        const requestedModel = req.model || undefined;
        const systemPrompt = req.systemPrompt || "";
        const protoMsgs = req.messages || [];
        const maxTokens = req.maxTokens || undefined;
        const temperature = req.temperature || undefined;

        const messages = protoMessagesToChatMessages(protoMsgs, systemPrompt);

        // Parse tool definitions from proto request
        const protoTools = req.tools || [];
        const tools: ToolDefinition[] = protoTools.map((t: any) => {
          let parameters: Record<string, unknown> = {};
          if (t.parametersJson) {
            try {
              const raw = typeof t.parametersJson === "string"
                ? t.parametersJson
                : Buffer.isBuffer(t.parametersJson)
                  ? t.parametersJson.toString("utf-8")
                  : String(t.parametersJson);
              parameters = JSON.parse(raw);
            } catch { /* use empty params */ }
          }
          return {
            type: "function" as const,
            function: { name: t.name || "", description: t.description || "", parameters },
          };
        });

        // Apply tool schema filtering if allowedToolNames is provided
        const allowedToolNames: string[] = req.allowedToolNames || [];
        const { filtered: filteredTools, strippedNames } = filterToolsByAllowedNames(tools, allowedToolNames);

        mapleLog("info", "model_router_generate", {
          requestedModel: requestedModel ?? "(default)",
          messageCount: messages.length,
          toolCount: filteredTools.length,
        });

        const result = await generateWithFallback(messages, requestedModel, maxTokens, temperature, filteredTools.length > 0 ? filteredTools : undefined);

        mapleLog("info", "model_router_generate_success", {
          provider: result.provider,
          model: result.model,
          finishReason: result.finishReason,
          totalTokens: result.usage.totalTokens,
        });
        emitAuditEvent({
          eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
          summary: `Model generate succeeded via ${result.provider} (${result.model})`,
          traceId: req.context?.traceId,
          payload: {
            provider: result.provider,
            model: result.model,
            finishReason: result.finishReason,
            totalTokens: result.usage.totalTokens,
          },
        });

        const responseToolCalls = (result.toolCalls ?? []).map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          argumentsJson: Buffer.from(tc.function.arguments),
        }));

        callback(null, {
          message: { role: "CHAT_ROLE_ASSISTANT", content: result.content },
          toolCalls: responseToolCalls,
          usage: {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
          },
          model: result.model,
          finishReason: result.finishReason,
          filteredTools: strippedNames,
        });
      } catch (err: any) {
        mapleLog("error", "model_router_generate_failed", { error: err.message });
        emitAuditEvent({
          eventType: "AUDIT_EVENT_TYPE_TOOL_FAILED",
          summary: "Model generate failed",
          traceId: call.request?.context?.traceId,
          severity: "RISK_SEVERITY_MEDIUM",
          payload: { error: err.message },
        });
        callback({ code: grpc.status.INTERNAL, message: err.message });
      }
    },

    async StreamGenerate(call: grpc.ServerWritableStream<any, any>) {
      try {
        const req = call.request;
        const requestedModel = req.model || undefined;
        const systemPrompt = req.systemPrompt || "";
        const protoMsgs = req.messages || [];
        const maxTokens = req.maxTokens || undefined;
        const temperature = req.temperature || undefined;

        const messages = protoMessagesToChatMessages(protoMsgs, systemPrompt);

        mapleLog("info", "model_router_stream_generate", {
          requestedModel: requestedModel ?? "(default)",
          messageCount: messages.length,
        });

        // Determine the provider to use (with fallback)
        const primary = config.primaryProvider;
        const fallback = getFallbackProvider(primary);
        const providers: Provider[] = isProviderAvailable(primary)
          ? [primary, fallback]
          : [fallback];

        let streamed = false;
        let lastError: Error | undefined;

        for (const provider of providers) {
          const apiKey = getApiKeyForProvider(provider);
          if (!apiKey) {
            mapleLog("warn", "model_router_stream_skip_provider", { provider, reason: "no_api_key" });
            continue;
          }

          const model = resolveModelForProvider(provider, provider === primary ? requestedModel : undefined);
          const opts: GenerateOptions = {
            model,
            messages,
            maxTokens: maxTokens || config.maxTokens,
            temperature: temperature || undefined,
            timeoutMs: config.chatTimeoutMs * 2, // Streaming gets a longer timeout
          };

          try {
            mapleLog("info", "model_router_stream_calling_provider", { provider, model });

            const streamFn = provider === "openai" ? streamOpenAI : streamAnthropic;
            const stream = streamFn(apiKey, opts);

            for await (const chunk of stream) {
              const response: Record<string, unknown> = {
                deltaContent: chunk.delta,
                finishReason: chunk.finishReason,
              };
              if (chunk.usage) {
                response.usage = {
                  promptTokens: chunk.usage.promptTokens,
                  completionTokens: chunk.usage.completionTokens,
                  totalTokens: chunk.usage.totalTokens,
                };
              }
              call.write(response);
            }

            streamed = true;
            mapleLog("info", "model_router_stream_complete", { provider, model });
            emitAuditEvent({
              eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
              summary: `Model stream completed via ${provider} (${model})`,
              traceId: req.context?.traceId,
              payload: { provider, model },
            });
            break;
          } catch (err: any) {
            lastError = err;
            mapleLog("warn", "model_router_stream_provider_failed", {
              provider,
              model,
              error: err.message,
            });
            // Continue to fallback
          }
        }

        if (!streamed) {
          const errMsg = lastError?.message ?? "No LLM providers available for streaming.";
          mapleLog("error", "model_router_stream_all_failed", { error: errMsg });
          emitAuditEvent({
            eventType: "AUDIT_EVENT_TYPE_TOOL_FAILED",
            summary: "Model stream failed",
            traceId: req.context?.traceId,
            severity: "RISK_SEVERITY_MEDIUM",
            payload: { error: errMsg },
          });
          // Write an error as the final chunk so the client knows what happened
          call.write({
            deltaContent: `[error] ${errMsg}`,
            finishReason: "error",
          });
        }

        call.end();
      } catch (err: any) {
        mapleLog("error", "model_router_stream_generate_failed", { error: err.message });
        call.end();
      }
    },
  };

  server.addService(modelProto.ModelRouterService.service, serviceImpl);
  return server;
}
