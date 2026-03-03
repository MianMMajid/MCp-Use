/**
 * fork-dispatcher.js
 *
 * Dispatches fork execution to the appropriate isolation backend:
 *   - "process" mode: child_process.fork() with Node IPC (dev/test)
 *   - "k8s" mode: K8s Job following the K8sJobDispatcher pattern (production)
 */
import { fork as cpFork } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapleLog } from "@maple/common";

const EXECUTOR_PATH = resolve(import.meta.dirname, "fork-executor.js");

export class ForkDispatcher {
    mode;

    constructor(mode) {
        this.mode = mode;
    }

    /**
     * Dispatch a forked trace for isolated execution.
     *
     * @param {object} forkedTrace  – The forked trace to execute
     * @param {object} parentTrace  – The parent trace (for context)
     * @param {object} options      – Execution options
     * @returns {Promise<object>}   – ForkExecutionResult
     */
    async dispatch(forkedTrace, parentTrace, options = {}) {
        const forkOffset = forkedTrace.forkedFromStep ?? 0;
        const stepsToReplay = (forkedTrace.steps || []).slice(forkOffset);

        const input = {
            forkedTrace,
            parentTraceId: parentTrace.id,
            stepsToReplay,
            config: {
                contextWallAddress: process.env.CONTEXT_WALL_ADDRESS || "localhost:9000",
                auditWriterAddress: process.env.AUDIT_WRITER_ADDRESS || "localhost:9400",
                stepTimeoutMs: options.stepTimeoutMs || 30000,
                totalTimeoutMs: options.totalTimeoutMs || 120000,
            },
        };

        if (this.mode === "process") {
            return this.dispatchProcess(input, options);
        }
        if (this.mode === "k8s") {
            return this.dispatchK8s(input, options);
        }
        throw new Error(`Unknown fork isolation mode: ${this.mode}`);
    }

    /**
     * Process mode — fork a child process via IPC.
     */
    async dispatchProcess(input, options) {
        const totalTimeoutMs = options.totalTimeoutMs || input.config.totalTimeoutMs || 120000;

        return new Promise((resolvePromise, rejectPromise) => {
            const child = cpFork(EXECUTOR_PATH, [], {
                stdio: ["pipe", "pipe", "pipe", "ipc"],
                env: {
                    ...process.env,
                    MAPLE_FORK_INPUT_MODE: "ipc",
                },
            });

            let resolved = false;
            let stdoutData = "";

            const timer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    child.kill("SIGKILL");
                    rejectPromise(new Error("Fork executor timed out"));
                }
            }, totalTimeoutMs + 5000); // 5s grace for IPC

            child.on("message", (msg) => {
                if (msg?.type === "fork-result" && !resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    resolvePromise(msg.result);
                }
            });

            if (child.stdout) {
                child.stdout.on("data", (chunk) => {
                    stdoutData += chunk.toString();
                });
            }

            child.on("error", (err) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    rejectPromise(new Error(`Fork executor error: ${err.message}`));
                }
            });

            child.on("exit", (code) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    // Try to parse result from stdout (MAPLE_FORK_RESULT: marker)
                    const result = parseResultFromLogs(stdoutData);
                    if (result) {
                        resolvePromise(result);
                    } else {
                        rejectPromise(new Error(`Fork executor exited with code ${code}`));
                    }
                }
            });

            // Send input via IPC
            child.send({ type: "fork-input", input });
        });
    }

    /**
     * K8s mode — create ConfigMap + Job, poll for completion, read result from logs.
     */
    async dispatchK8s(input, options) {
        const namespace = process.env.MAPLE_FORK_EXECUTOR_JOB_NAMESPACE || "maple";
        const image = process.env.MAPLE_FORK_EXECUTOR_IMAGE;
        if (!image) {
            throw new Error("MAPLE_FORK_EXECUTOR_IMAGE is required for k8s fork isolation mode");
        }

        if (!process.env.KUBERNETES_SERVICE_HOST || !process.env.KUBERNETES_SERVICE_PORT) {
            throw new Error("Not running in a Kubernetes cluster (KUBERNETES_SERVICE_HOST/PORT not set)");
        }

        const apiServer = `https://${process.env.KUBERNETES_SERVICE_HOST}:${process.env.KUBERNETES_SERVICE_PORT}`;
        let serviceAccountToken = "";
        let caCert = null;
        try {
            serviceAccountToken = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/token", "utf-8").trim();
        } catch {
            mapleLog("warn", "fork_dispatcher_no_sa_token");
        }
        try {
            caCert = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt", "utf-8");
        } catch {
            // Optional
        }

        const jobId = `fork-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const configMapName = `${jobId}-input`;
        const totalTimeoutMs = options.totalTimeoutMs || input.config.totalTimeoutMs || 120000;
        const start = Date.now();

        const k8sApi = async (opts) => {
            const text = await k8sApiRaw(apiServer, serviceAccountToken, opts);
            return JSON.parse(text);
        };

        try {
            // 1. Create ConfigMap with input
            await k8sApi({
                method: "POST",
                path: `/api/v1/namespaces/${namespace}/configmaps`,
                body: {
                    apiVersion: "v1",
                    kind: "ConfigMap",
                    metadata: {
                        name: configMapName,
                        namespace,
                        labels: { "app.kubernetes.io/managed-by": "gateway-api", "maple-fork-job-id": jobId },
                    },
                    data: {
                        "request.json": JSON.stringify(input),
                    },
                },
            });

            // 2. Create Job
            await k8sApi({
                method: "POST",
                path: `/apis/batch/v1/namespaces/${namespace}/jobs`,
                body: buildForkJobSpec(jobId, configMapName, namespace, image, input.config),
            });

            // 3. Poll for completion
            const pollTimeout = Math.min(totalTimeoutMs + 30000, 300000);
            const result = await pollJobCompletion(k8sApi, namespace, jobId, pollTimeout, apiServer, serviceAccountToken);

            // 4. Cleanup ConfigMap
            k8sApi({
                method: "DELETE",
                path: `/api/v1/namespaces/${namespace}/configmaps/${configMapName}`,
            }).catch(() => { /* best-effort */ });

            return result;
        } catch (err) {
            mapleLog("error", "fork_k8s_dispatch_failed", { jobId, error: err.message });
            // Cleanup on failure
            k8sApi({
                method: "DELETE",
                path: `/api/v1/namespaces/${namespace}/configmaps/${configMapName}`,
            }).catch(() => { });
            throw err;
        }
    }
}

function buildForkJobSpec(jobId, configMapName, namespace, image, config) {
    return {
        apiVersion: "batch/v1",
        kind: "Job",
        metadata: {
            name: jobId,
            namespace,
            labels: { "app.kubernetes.io/managed-by": "gateway-api", "maple-fork-job-id": jobId },
        },
        spec: {
            ttlSecondsAfterFinished: 300,
            backoffLimit: 0,
            activeDeadlineSeconds: Math.ceil((config.totalTimeoutMs || 120000) / 1000) + 30,
            template: {
                metadata: {
                    labels: { app: "fork-executor-job", "maple-fork-job-id": jobId },
                },
                spec: {
                    restartPolicy: "Never",
                    serviceAccountName: "fork-executor-job",
                    securityContext: {
                        runAsNonRoot: true,
                        runAsUser: 1000,
                        runAsGroup: 1000,
                        fsGroup: 1000,
                    },
                    containers: [
                        {
                            name: "fork-executor",
                            image,
                            command: ["node", "dist/core/fork-executor.js"],
                            env: [
                                { name: "CONTEXT_WALL_ADDRESS", value: config.contextWallAddress || "context-wall.maple.svc:9000" },
                                { name: "AUDIT_WRITER_ADDRESS", value: config.auditWriterAddress || "audit-writer.maple.svc:9400" },
                                { name: "MAPLE_FORK_INPUT_PATH", value: "/fork-input/request.json" },
                                { name: "MAPLE_GRPC_TLS_CERT", value: "/etc/maple/grpc-tls/tls.crt" },
                                { name: "MAPLE_GRPC_TLS_KEY", value: "/etc/maple/grpc-tls/tls.key" },
                                { name: "MAPLE_GRPC_TLS_CA", value: "/etc/maple/grpc-tls/ca.crt" },
                            ],
                            volumeMounts: [
                                { name: "fork-input", mountPath: "/fork-input", readOnly: true },
                                { name: "grpc-tls", mountPath: "/etc/maple/grpc-tls", readOnly: true },
                            ],
                            securityContext: {
                                readOnlyRootFilesystem: true,
                                allowPrivilegeEscalation: false,
                                capabilities: { drop: ["ALL"] },
                            },
                            resources: {
                                requests: { memory: "128Mi", cpu: "100m" },
                                limits: { memory: "512Mi", cpu: "500m" },
                            },
                        },
                    ],
                    volumes: [
                        {
                            name: "fork-input",
                            configMap: { name: configMapName },
                        },
                        {
                            name: "grpc-tls",
                            secret: { secretName: "maple-grpc-tls", optional: true },
                        },
                    ],
                },
            },
        },
    };
}

async function pollJobCompletion(k8sApi, namespace, jobId, timeoutMs, apiServer, token) {
    const start = Date.now();
    const pollIntervalMs = 2000;
    while (Date.now() - start < timeoutMs) {
        const job = await k8sApi({
            method: "GET",
            path: `/apis/batch/v1/namespaces/${namespace}/jobs/${jobId}`,
        });
        const conditions = job?.status?.conditions || [];
        const completed = conditions.find((c) => c.type === "Complete" && c.status === "True");
        const failed = conditions.find((c) => c.type === "Failed" && c.status === "True");
        if (completed || failed) {
            return readJobResult(k8sApi, namespace, jobId, Date.now() - start, apiServer, token);
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    return {
        success: false,
        forkedTraceId: "unknown",
        parentTraceId: "unknown",
        executedSteps: [],
        totalDurationMs: Date.now() - start,
        errorMessage: "Fork job timed out waiting for completion",
    };
}

async function readJobResult(k8sApi, namespace, jobId, durationMs, apiServer, token) {
    try {
        const pods = await k8sApi({
            method: "GET",
            path: `/api/v1/namespaces/${namespace}/pods?labelSelector=maple-fork-job-id%3D${jobId}`,
        });
        const pod = pods?.items?.[0];
        if (!pod) {
            return { success: false, forkedTraceId: "unknown", parentTraceId: "unknown", executedSteps: [], totalDurationMs: durationMs, errorMessage: "Fork job pod not found" };
        }
        const logs = await k8sApiRaw(apiServer, token, {
            method: "GET",
            path: `/api/v1/namespaces/${namespace}/pods/${pod.metadata.name}/log`,
        });
        const result = parseResultFromLogs(logs);
        if (result) {
            result.totalDurationMs = durationMs;
            return result;
        }
        return { success: false, forkedTraceId: "unknown", parentTraceId: "unknown", executedSteps: [], totalDurationMs: durationMs, errorMessage: "No result marker found in fork job logs" };
    } catch (err) {
        return { success: false, forkedTraceId: "unknown", parentTraceId: "unknown", executedSteps: [], totalDurationMs: durationMs, errorMessage: `Failed to read fork job result: ${err.message}` };
    }
}

function parseResultFromLogs(logs) {
    if (!logs) return null;
    const lines = logs.split("\n");
    for (const line of lines) {
        if (line.startsWith("MAPLE_FORK_RESULT:")) {
            try {
                return JSON.parse(line.slice("MAPLE_FORK_RESULT:".length));
            } catch {
                return null;
            }
        }
    }
    return null;
}

async function k8sApiRaw(apiServer, token, opts) {
    const url = `${apiServer}${opts.path}`;
    const headers = {
        Authorization: `Bearer ${token}`,
    };
    if (opts.body) {
        headers["Content-Type"] = "application/json";
    }
    const fetchOpts = {
        method: opts.method,
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
    };
    const resp = await fetch(url, fetchOpts);
    if (!resp.ok && opts.method !== "DELETE") {
        const body = await resp.text();
        throw new Error(`K8s API ${opts.method} ${opts.path} failed: ${resp.status} ${body}`);
    }
    return resp.text();
}
//# sourceMappingURL=fork-dispatcher.js.map
