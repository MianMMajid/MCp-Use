import { error, object, widget } from "mcp-use/server";
import { server, sharedTraceStore } from "../state.js";
import {
  getTraceForCurrentOwner,
  auditAndPersist,
} from "../trace-helpers.js";
import { toRiskWidgetProps } from "../core/presenters.js";
import {
  auditRiskInputSchema,
  mlAnomalyReportInputSchema,
} from "../core/tool-schemas.js";
import { zodCompat } from "./mcp-tools-trace-common.js";

export function registerAuditRiskTool() {
  server.tool(
    {
      name: "audit_risk",
      description:
        "Audit a trace for anomalies and risky behavior (shell/network/credentials) and return a risk dashboard.",
      schema: zodCompat(auditRiskInputSchema),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      widget: {
        name: "risk-dashboard",
        invoking: "Running risk analysis...",
        invoked: "Risk dashboard ready",
      },
    },
    async ({ traceId, topFlags }) => {
      const trace = getTraceForCurrentOwner(traceId);
      if (!trace) {
        return error(`Trace ${traceId} not found.`);
      }

      const report = auditAndPersist(trace);

      return widget({
        props: toRiskWidgetProps(trace, report, topFlags),
        output: object({
          traceId,
          overallRiskScore: report.overallRiskScore,
          severity: report.severity,
          flagCount: report.flags.length,
          status: trace.status,
        }),
      });
    },
  );
}

export function registerMlAnomalyReportTool() {
  server.tool(
    {
      name: "ml_anomaly_report",
      description:
        "Run embedding-based anomaly detection on a trace, with optional community baseline from shared anonymized traces.",
      schema: zodCompat(mlAnomalyReportInputSchema),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ traceId, useCommunityBaseline, threshold, topAnomalies }) => {
      const trace = getTraceForCurrentOwner(traceId);
      if (!trace) {
        return error(`Trace ${traceId} not found.`);
      }

      const report = auditAndPersist(trace, { useCommunityBaseline, threshold });
      const anomalies = report.flags.filter((flag) => flag.type === "embedding_anomaly").slice(0, topAnomalies);

      return object({
        traceId,
        overallRiskScore: report.overallRiskScore,
        severity: report.severity,
        anomalyCount: anomalies.length,
        anomalies,
        usedCommunityBaseline: useCommunityBaseline,
        baselinePoolSize: useCommunityBaseline ? sharedTraceStore.getEmbeddingBaselines(250).length : 0,
      });
    },
  );
}
