/**
 * K8s Job Dispatcher
 *
 * Dispatches tool execution requests as Kubernetes Jobs for sandboxed execution.
 * Each tool invocation runs in an isolated Job pod with:
 * - Non-root user (UID 1000)
 * - Read-only root filesystem
 * - All capabilities dropped
 * - Resource limits
 * - NetworkPolicy restricting egress to cyber-proxy and audit-writer only
 *
 * Flow:
 * 1. Create a ConfigMap with the request JSON
 * 2. Create a Job that mounts the ConfigMap and runs the job-entrypoint
 * 3. Poll for Job completion
 * 4. Read result from Job pod logs (MAPLE_JOB_RESULT: marker)
 * 5. Clean up ConfigMap (Job auto-cleans via TTL)
 */
import { readFileSync } from "node:fs";
import { mapleLog } from "@maple/common";
import { config } from "./config.js";

interface JobDispatchRequest {
  appId: string;
  targetUrl: string;
  payloadJson: string;
  timeoutMs: number;
  traceId?: string;
  credentialId?: string;
  credentialToken?: string;
  credentialScopes?: string[];
}

interface JobDispatchResult {
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

interface K8sApiOptions {
  method: string;
  path: string;
  body?: unknown;
}

export class K8sJobDispatcher {
  private readonly namespace: string;
  private readonly image: string;
  private readonly serviceAccountToken: string;
  private readonly apiServer: string;
  private readonly caCert: string | null;

  constructor() {
    this.namespace = config.toolRunnerJobNamespace;
    this.image = config.toolRunnerImage;

    // In-cluster K8s API access
    this.apiServer = `https://${process.env.KUBERNETES_SERVICE_HOST || "kubernetes.default.svc"}:${process.env.KUBERNETES_SERVICE_PORT || "443"}`;

    try {
      this.serviceAccountToken = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/token", "utf-8").trim();
    } catch {
      this.serviceAccountToken = "";
      mapleLog("warn", "k8s_job_dispatcher_no_sa_token");
    }

    try {
      this.caCert = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt", "utf-8");
    } catch {
      this.caCert = null;
    }
  }

  async dispatch(request: JobDispatchRequest): Promise<JobDispatchResult> {
    const jobId = `tool-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const configMapName = `${jobId}-input`;
    const start = Date.now();

    try {
      // 1. Create ConfigMap with request
      await this.k8sApi({
        method: "POST",
        path: `/api/v1/namespaces/${this.namespace}/configmaps`,
        body: {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
            name: configMapName,
            namespace: this.namespace,
            labels: { "app.kubernetes.io/managed-by": "mcp-proxy", "maple-job-id": jobId },
          },
          data: {
            "request.json": JSON.stringify(request),
          },
        },
      });

      // 2. Create Job
      await this.k8sApi({
        method: "POST",
        path: `/apis/batch/v1/namespaces/${this.namespace}/jobs`,
        body: this.buildJobSpec(jobId, configMapName),
      });

      // 3. Poll for completion
      const pollTimeout = Math.min(request.timeoutMs + 30000, 120000); // extra 30s for pod scheduling
      const result = await this.pollJobCompletion(jobId, pollTimeout);

      // 4. Cleanup ConfigMap
      this.cleanupConfigMap(configMapName).catch(() => {
        // Best-effort cleanup
      });

      return result;
    } catch (err: any) {
      mapleLog("error", "k8s_job_dispatch_failed", { jobId, error: err.message });

      // Cleanup on failure
      this.cleanupConfigMap(configMapName).catch(() => {});

      return {
        success: false,
        responseJson: "{}",
        statusCode: 502,
        durationMs: Date.now() - start,
        errorMessage: `Job dispatch failed: ${err.message}`,
      };
    }
  }

  private buildJobSpec(jobId: string, configMapName: string): object {
    return {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        name: jobId,
        namespace: this.namespace,
        labels: { "app.kubernetes.io/managed-by": "mcp-proxy", "maple-job-id": jobId },
      },
      spec: {
        ttlSecondsAfterFinished: 300,
        backoffLimit: 0,
        activeDeadlineSeconds: 120,
        template: {
          metadata: {
            labels: { app: "tool-runner-job", "maple-job-id": jobId },
          },
          spec: {
            restartPolicy: "Never",
            serviceAccountName: "tool-runner-job",
            securityContext: {
              runAsNonRoot: true,
              runAsUser: 1000,
              runAsGroup: 1000,
              fsGroup: 1000,
            },
            containers: [
              {
                name: "tool-runner",
                image: this.image,
                command: ["node", "dist/job-entrypoint.js"],
                env: [
                  { name: "CYBER_PROXY_ADDRESS", value: `cyber-proxy.maple-cyber.svc:8080` },
                  { name: "MAPLE_JOB_INPUT_PATH", value: "/job-input/request.json" },
                  { name: "MAPLE_JOB_OUTPUT_PATH", value: "/job-output/result.json" },
                  { name: "MAPLE_GRPC_TLS_CERT", value: "/etc/maple/grpc-tls/tls.crt" },
                  { name: "MAPLE_GRPC_TLS_KEY", value: "/etc/maple/grpc-tls/tls.key" },
                  { name: "MAPLE_GRPC_TLS_CA", value: "/etc/maple/grpc-tls/ca.crt" },
                ],
                volumeMounts: [
                  { name: "job-input", mountPath: "/job-input", readOnly: true },
                  { name: "job-output", mountPath: "/job-output" },
                  { name: "grpc-tls", mountPath: "/etc/maple/grpc-tls", readOnly: true },
                ],
                securityContext: {
                  readOnlyRootFilesystem: true,
                  allowPrivilegeEscalation: false,
                  capabilities: { drop: ["ALL"] },
                },
                resources: {
                  requests: { memory: "64Mi", cpu: "50m" },
                  limits: { memory: "256Mi", cpu: "250m" },
                },
              },
            ],
            volumes: [
              {
                name: "job-input",
                configMap: { name: configMapName },
              },
              {
                name: "job-output",
                emptyDir: {},
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

  private async pollJobCompletion(jobId: string, timeoutMs: number): Promise<JobDispatchResult> {
    const start = Date.now();
    const pollIntervalMs = 2000;

    while (Date.now() - start < timeoutMs) {
      const job = await this.k8sApi({
        method: "GET",
        path: `/apis/batch/v1/namespaces/${this.namespace}/jobs/${jobId}`,
      }) as any;

      const conditions = job?.status?.conditions || [];
      const completed = conditions.find((c: any) => c.type === "Complete" && c.status === "True");
      const failed = conditions.find((c: any) => c.type === "Failed" && c.status === "True");

      if (completed || failed) {
        return this.readJobResult(jobId, Date.now() - start);
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    return {
      success: false,
      responseJson: "{}",
      statusCode: 504,
      durationMs: Date.now() - start,
      errorMessage: "Job timed out waiting for completion",
    };
  }

  private async readJobResult(jobId: string, durationMs: number): Promise<JobDispatchResult> {
    try {
      // Find the pod for this job
      const pods = await this.k8sApi({
        method: "GET",
        path: `/api/v1/namespaces/${this.namespace}/pods?labelSelector=maple-job-id%3D${jobId}`,
      }) as any;

      const pod = pods?.items?.[0];
      if (!pod) {
        return { success: false, responseJson: "{}", statusCode: 502, durationMs, errorMessage: "Job pod not found" };
      }

      // Read logs
      const logs = await this.k8sApiRaw({
        method: "GET",
        path: `/api/v1/namespaces/${this.namespace}/pods/${pod.metadata.name}/log`,
      });

      // Parse MAPLE_JOB_RESULT marker from logs
      const lines = logs.split("\n");
      for (const line of lines) {
        if (line.startsWith("MAPLE_JOB_RESULT:")) {
          const json = line.slice("MAPLE_JOB_RESULT:".length);
          const result = JSON.parse(json) as JobDispatchResult;
          result.durationMs = durationMs;
          return result;
        }
      }

      return { success: false, responseJson: "{}", statusCode: 502, durationMs, errorMessage: "No result marker found in job logs" };
    } catch (err: any) {
      return { success: false, responseJson: "{}", statusCode: 502, durationMs, errorMessage: `Failed to read job result: ${err.message}` };
    }
  }

  private async cleanupConfigMap(name: string): Promise<void> {
    await this.k8sApi({
      method: "DELETE",
      path: `/api/v1/namespaces/${this.namespace}/configmaps/${name}`,
    });
  }

  private async k8sApi(opts: K8sApiOptions): Promise<unknown> {
    const text = await this.k8sApiRaw(opts);
    return JSON.parse(text);
  }

  private async k8sApiRaw(opts: K8sApiOptions): Promise<string> {
    const url = `${this.apiServer}${opts.path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.serviceAccountToken}`,
    };
    if (opts.body) {
      headers["Content-Type"] = "application/json";
    }

    const fetchOpts: RequestInit = {
      method: opts.method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    };

    // In-cluster, Node's fetch uses the service account CA automatically
    // if NODE_EXTRA_CA_CERTS is set. For most K8s setups this works out of the box.
    const resp = await fetch(url, fetchOpts);

    if (!resp.ok && opts.method !== "DELETE") {
      const body = await resp.text();
      throw new Error(`K8s API ${opts.method} ${opts.path} failed: ${resp.status} ${body}`);
    }

    return resp.text();
  }
}
