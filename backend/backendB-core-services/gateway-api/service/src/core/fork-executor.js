/**
 * fork-executor.js
 *
 * Standalone entrypoint that runs in a child process (dev/test) or K8s pod
 * (production) to re-execute forked trace steps in isolation.
 *
 * Input modes:
 *   - MAPLE_FORK_INPUT_MODE=ipc  → receives input via IPC message
 *   - MAPLE_FORK_INPUT_PATH set  → reads input from file (K8s ConfigMap mount)
 *
 * Output:
 *   - IPC mode: sends result via process.send()
 *   - K8s mode: emits MAPLE_FORK_RESULT:<json> to stdout
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadGrpcTlsConfig, loadServiceClientSecure } from "@maple/common";

const PROTO_ROOT = resolve(import.meta.dirname, "../../../../proto");

function grpcUnary(client, method, request) {
    return new Promise((resolvePromise, rejectPromise) => {
        client[method](request, (err, response) => {
            if (err) rejectPromise(err);
            else resolvePromise(response);
        });
    });
}

function emitResult(result) {
    const json = JSON.stringify(result);
    // IPC mode — send back to parent
    if (process.send) {
        process.send({ type: "fork-result", result });
    }
    // Always emit marker for K8s log-based retrieval
    console.log(`MAPLE_FORK_RESULT:${json}`);
}

function loadServiceClient(protoFile, servicePath, address, tlsConfig) {
    return loadServiceClientSecure(protoFile, servicePath, address, PROTO_ROOT, tlsConfig);
}

async function executeStep(step, index, contextWallClient, config) {
    const start = Date.now();
    const stepType = step.type || step.stepType || "";

    // Prompt/system steps pass through unchanged
    if (stepType === "prompt" || stepType === "system" || stepType === "assistant") {
        return {
            index,
            success: true,
            output: step.output ?? step.content ?? null,
            toolOutput: null,
            durationMs: Date.now() - start,
            guardStatus: "pass-through",
            riskScore: 0,
            riskFlags: [],
            error: null,
        };
    }

    const gatewayContext = {
        traceId: config.traceId || "",
        sessionId: config.sessionId || "",
        sourceService: "fork-executor",
    };

    try {
        let response;
        if (stepType === "tool_call" && step.toolCall) {
            // Execute tool via context-wall gRPC
            response = await grpcUnary(contextWallClient, "executeToolWithPolicy", {
                context: gatewayContext,
                appId: step.toolCall.appId || config.appId || "fork",
                targetUrl: step.toolCall.targetUrl || config.targetUrl || "",
                toolName: step.toolCall.name || step.toolCall.toolName || "unknown",
                argumentsJson: Buffer.from(JSON.stringify(step.toolCall.arguments || {})),
                sessionId: gatewayContext.sessionId,
                traceId: gatewayContext.traceId,
            });
        } else {
            // Shell/network/other steps → forward as JSON-RPC
            const payload = {
                jsonrpc: "2.0",
                id: `fork-step-${index}`,
                method: step.method || "tools/call",
                params: step.params || step.toolCall || {},
            };
            response = await grpcUnary(contextWallClient, "forwardJsonRpcWithPolicy", {
                context: gatewayContext,
                appId: step.appId || config.appId || "fork",
                targetUrl: step.targetUrl || config.targetUrl || "",
                payloadJson: Buffer.from(JSON.stringify(payload)),
            });
        }

        const blocked = response?.allowed === false;
        return {
            index,
            success: !blocked && (response?.success !== false),
            output: response?.responseJson
                ? (typeof response.responseJson === "string" ? response.responseJson : JSON.stringify(response.responseJson))
                : null,
            toolOutput: response?.resultJson
                ? (typeof response.resultJson === "string" ? response.resultJson : JSON.stringify(response.resultJson))
                : null,
            durationMs: Date.now() - start,
            guardStatus: blocked ? "blocked" : "allowed",
            riskScore: Number(response?.riskScore) || 0,
            riskFlags: Array.isArray(response?.riskFlags) ? response.riskFlags : [],
            error: blocked ? (response?.blockedReason || "Policy blocked") : null,
        };
    } catch (err) {
        return {
            index,
            success: false,
            output: null,
            toolOutput: null,
            durationMs: Date.now() - start,
            guardStatus: "error",
            riskScore: 0,
            riskFlags: [],
            error: err.message,
        };
    }
}

async function run(input) {
    const start = Date.now();
    const {
        forkedTrace,
        parentTraceId,
        stepsToReplay = [],
        config: executionConfig = {},
    } = input;

    const forkedTraceId = forkedTrace?.id || "unknown";
    const stepTimeoutMs = executionConfig.stepTimeoutMs || 30000;
    const totalTimeoutMs = executionConfig.totalTimeoutMs || 120000;

    // Set up gRPC client for context-wall
    const contextWallAddress = executionConfig.contextWallAddress
        || process.env.CONTEXT_WALL_ADDRESS
        || "localhost:9000";

    const tlsConfig = loadGrpcTlsConfig();
    let contextWallClient;
    try {
        contextWallClient = loadServiceClient(
            "maple/contextwall/v1/context_wall.proto",
            "maple.contextwall.v1.ContextWallService",
            contextWallAddress,
            tlsConfig,
        );
    } catch (err) {
        emitResult({
            success: false,
            forkedTraceId,
            parentTraceId,
            executedSteps: [],
            totalDurationMs: Date.now() - start,
            errorMessage: `Failed to create gRPC client: ${err.message}`,
        });
        process.exit(1);
    }

    const executedSteps = [];
    const stepConfig = {
        traceId: forkedTraceId,
        sessionId: forkedTrace?.sessionId || "",
        appId: executionConfig.appId || "fork",
        targetUrl: executionConfig.targetUrl || "",
    };

    try {
        for (let i = 0; i < stepsToReplay.length; i++) {
            // Check total timeout
            if (Date.now() - start > totalTimeoutMs) {
                emitResult({
                    success: false,
                    forkedTraceId,
                    parentTraceId,
                    executedSteps,
                    totalDurationMs: Date.now() - start,
                    errorMessage: "Total execution timeout exceeded",
                });
                closeClient(contextWallClient);
                process.exit(1);
            }

            const step = stepsToReplay[i];
            // Per-step timeout via Promise.race
            const stepPromise = executeStep(step, i, contextWallClient, stepConfig);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Step timeout exceeded")), stepTimeoutMs),
            );
            let result;
            try {
                result = await Promise.race([stepPromise, timeoutPromise]);
            } catch (err) {
                result = {
                    index: i,
                    success: false,
                    output: null,
                    toolOutput: null,
                    durationMs: stepTimeoutMs,
                    guardStatus: "timeout",
                    riskScore: 0,
                    riskFlags: [],
                    error: err.message,
                };
            }
            executedSteps.push(result);
        }

        const allSuccess = executedSteps.every((s) => s.success);
        emitResult({
            success: allSuccess,
            forkedTraceId,
            parentTraceId,
            executedSteps,
            totalDurationMs: Date.now() - start,
            errorMessage: allSuccess ? null : "One or more steps failed",
        });
    } catch (err) {
        emitResult({
            success: false,
            forkedTraceId,
            parentTraceId,
            executedSteps,
            totalDurationMs: Date.now() - start,
            errorMessage: err.message,
        });
    }

    closeClient(contextWallClient);
}

function closeClient(client) {
    try {
        if (client?.close) client.close();
    } catch {
        // Best-effort cleanup
    }
}

// ── Input mode selection ──────────────────────────────────────────────────

const inputMode = process.env.MAPLE_FORK_INPUT_MODE || "";
const inputPath = process.env.MAPLE_FORK_INPUT_PATH || "";

if (inputPath) {
    // K8s ConfigMap mode — read from file
    try {
        const raw = readFileSync(inputPath, "utf-8");
        const input = JSON.parse(raw);
        run(input);
    } catch (err) {
        emitResult({
            success: false,
            forkedTraceId: "unknown",
            parentTraceId: "unknown",
            executedSteps: [],
            totalDurationMs: 0,
            errorMessage: `Failed to read fork input: ${err.message}`,
        });
        process.exit(1);
    }
} else if (inputMode === "ipc" || process.send) {
    // IPC mode — wait for message from parent
    process.on("message", (msg) => {
        if (msg?.type === "fork-input") {
            run(msg.input);
        }
    });
} else {
    // No input mode configured — exit cleanly
    emitResult({
        success: false,
        forkedTraceId: "unknown",
        parentTraceId: "unknown",
        executedSteps: [],
        totalDurationMs: 0,
        errorMessage: "No input mode configured. Set MAPLE_FORK_INPUT_MODE=ipc or MAPLE_FORK_INPUT_PATH.",
    });
    process.exit(1);
}
//# sourceMappingURL=fork-executor.js.map
