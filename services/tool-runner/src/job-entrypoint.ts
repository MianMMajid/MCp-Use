/**
 * Tool Runner Job Entrypoint
 *
 * Single-shot script for K8s Job-based tool execution.
 * Reads request from /job-input/request.json (ConfigMap mount),
 * executes via cyber-proxy gRPC ProxyHttpRequest,
 * writes result to stdout in a structured format for log retrieval.
 *
 * Exit codes:
 *   0 — success
 *   1 — failure
 */
import * as grpc from "@grpc/grpc-js";
import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { loadGrpcTlsConfig, loadServiceClientSecure } from "@maple/common";

const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");
const grpcTlsConfig = loadGrpcTlsConfig();

const CYBER_PROXY_ADDRESS = process.env.CYBER_PROXY_ADDRESS || "cyber-proxy.maple-cyber.svc:8080";
const INPUT_PATH = process.env.MAPLE_JOB_INPUT_PATH || "/job-input/request.json";
const OUTPUT_PATH = process.env.MAPLE_JOB_OUTPUT_PATH || "/job-output/result.json";

interface JobRequest {
  appId: string;
  targetUrl: string;
  payloadJson: string;
  timeoutMs?: number;
  traceId?: string;
  credentialId?: string;
  credentialToken?: string;
  credentialScopes?: string[];
}

interface JobResult {
  success: boolean;
  responseJson: string;
  statusCode: number;
  durationMs: number;
  errorMessage?: string;
  cyberReport?: {
    urlReputation: string;
    sanitized: boolean;
    malware: boolean;
    quarantined: boolean;
    threatsFound: string[];
    quarantineReason: string;
    resolvedIp: string;
  };
}

function inferToolNameFromJsonRpcPayload(payloadRaw: string): string {
  try {
    const parsed = JSON.parse(payloadRaw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "jsonrpc.forward";
    }
    const payload = parsed as Record<string, unknown>;
    const method = String(payload.method || "").trim();
    if (method === "tools/call") {
      const params = payload.params && typeof payload.params === "object" && !Array.isArray(payload.params)
        ? payload.params as Record<string, unknown>
        : {};
      const toolName = String(params.name || "").trim();
      if (toolName) return toolName;
    }
    if (method) return `jsonrpc.${method}`;
    return "jsonrpc.forward";
  } catch {
    return "jsonrpc.forward";
  }
}

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

async function run(): Promise<void> {
  const start = Date.now();

  // Read request from ConfigMap mount
  let request: JobRequest;
  try {
    const raw = readFileSync(INPUT_PATH, "utf-8");
    request = JSON.parse(raw);
  } catch (err: any) {
    const result: JobResult = {
      success: false,
      responseJson: "{}",
      statusCode: 0,
      durationMs: Date.now() - start,
      errorMessage: `Failed to read job input: ${err.message}`,
    };
    emitResult(result);
    process.exit(1);
  }

  const cyberProxy = loadServiceClient(
    "maple/cyber/v1/cyber_proxy.proto",
    "maple.cyber.v1.CyberProxyService",
    CYBER_PROXY_ADDRESS,
  );

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    if (request.credentialId) {
      headers["x-maple-credential-id"] = request.credentialId;
    }
    if (request.credentialToken) {
      headers["x-maple-credential-token"] = request.credentialToken;
    }
    if (request.credentialScopes && request.credentialScopes.length > 0) {
      headers["x-maple-credential-scopes"] = request.credentialScopes.join(",");
    }

    const response = await grpcUnary<any>(cyberProxy, "proxyHttpRequest", {
      context: {
        traceId: request.traceId || "",
        sourceService: "tool-runner-job",
      },
      method: "POST",
      url: request.targetUrl,
      headers,
      body: Buffer.from(request.payloadJson),
      toolName: inferToolNameFromJsonRpcPayload(request.payloadJson),
      appId: request.appId || "",
      timeoutMs: request.timeoutMs || 30000,
    });

    const statusCode = Number(response?.statusCode ?? 502);
    const responseBody = response?.body
      ? (Buffer.isBuffer(response.body) ? response.body.toString("utf-8") : String(response.body))
      : "{}";
    const threatsFound = Array.isArray(response?.threatsFound)
      ? response.threatsFound.map((threat: unknown) => String(threat))
      : [];

    const result: JobResult = {
      success: statusCode < 400,
      responseJson: responseBody,
      statusCode,
      durationMs: Date.now() - start,
      errorMessage: statusCode >= 400 ? `HTTP ${statusCode}` : undefined,
      cyberReport: {
        urlReputation: statusCode >= 400 ? "blocked" : "ok",
        sanitized: Boolean(response?.sanitized),
        malware: Boolean(response?.malwareDetected) || threatsFound.length > 0,
        quarantined: Boolean(response?.quarantined),
        threatsFound,
        quarantineReason: String(response?.quarantineReason || response?.policyReason || ""),
        resolvedIp: String(response?.resolvedIp || ""),
      },
    };

    emitResult(result);
    process.exit(result.success ? 0 : 1);
  } catch (err: any) {
    const result: JobResult = {
      success: false,
      responseJson: "{}",
      statusCode: 502,
      durationMs: Date.now() - start,
      errorMessage: err.message,
    };
    emitResult(result);
    process.exit(1);
  }
}

function emitResult(result: JobResult): void {
  const json = JSON.stringify(result);

  // Write to output volume (if writable)
  try {
    writeFileSync(OUTPUT_PATH, json);
  } catch {
    // Output dir may not be available; fall through to stdout
  }

  // Write structured marker to stdout for log-based retrieval
  console.log(`MAPLE_JOB_RESULT:${json}`);
}

run();
