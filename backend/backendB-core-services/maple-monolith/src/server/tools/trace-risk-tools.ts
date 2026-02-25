import { error, object, widget } from "mcp-use/server";
import { forkTrace } from "../../core/forking.js";
import { toReplayWidgetProps, toRiskWidgetProps } from "../../core/presenters.js";
import {
  auditRiskInputSchema,
  guardActionInputSchema,
  guardActionOutputSchema,
  mlAnomalyReportInputSchema,
  replayForkInputSchema,
} from "../../core/tool-schemas.js";
import type { AuditReport, Trace, TraceForkEdits } from "../../core/types.js";

interface ToolRegistrar {
  tool: (...args: any[]) => unknown;
}

interface SharedTraceStoreLike {
  getEmbeddingBaselines: (limit: number) => number[][];
}

interface RegisterTraceRiskToolsDeps {
  getTraceForCurrentOwner: (traceId: string) => Trace | undefined;
  upsertTraceForCurrentOwner: (trace: Trace) => Trace;
  auditAndPersist: (
    trace: Trace,
    options?: { useCommunityBaseline?: boolean; threshold?: number }
  ) => AuditReport;
  setGuardActionForCurrentOwner: (
    traceId: string,
    stepIndex: number,
    action: "allow" | "block" | "pending",
    reason?: string
  ) => Trace | undefined;
  sharedTraceStore: SharedTraceStoreLike;
}

export function registerTraceRiskTools(server: ToolRegistrar, deps: RegisterTraceRiskToolsDeps): void {
  const {
    auditAndPersist,
    getTraceForCurrentOwner,
    setGuardActionForCurrentOwner,
    sharedTraceStore,
    upsertTraceForCurrentOwner,
  } = deps;

  server.tool(
    {
      name: "replay_fork",
      description:
        "Fork a trace at a selected step, apply edits, and replay forward in dry-run mode for safe debugging.",
      schema: replayForkInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      widget: {
        name: "replay-simulator",
        invoking: "Forking trace...",
        invoked: "Replay diff ready",
      },
    },
    async ({
      traceId,
      forkStepIndex,
      edits,
    }: {
      traceId: string;
      forkStepIndex: number;
      edits: TraceForkEdits;
    }) => {
      const original = getTraceForCurrentOwner(traceId);
      if (!original) {
        return error(`Trace ${traceId} not found.`);
      }

      try {
        const { forkedTrace, diff } = forkTrace(original, forkStepIndex, edits);
        upsertTraceForCurrentOwner(forkedTrace);
        auditAndPersist(forkedTrace);

        const replayProps = toReplayWidgetProps(original, forkedTrace, diff, forkStepIndex, edits);

        return widget({
          props: replayProps,
          output: object({
            originalTraceId: original.id,
            forkedTraceId: forkedTrace.id,
            forkStepIndex,
            changedSteps: diff.changedSteps,
            addedSteps: diff.addedSteps,
            status: forkedTrace.status,
          }),
        });
      } catch (forkError) {
        return error(
          forkError instanceof Error ? forkError.message : "Unable to fork trace due to unknown error."
        );
      }
    }
  );

  server.tool(
    {
      name: "audit_risk",
      description:
        "Audit a trace for anomalies and risky behavior (shell/network/credentials) and return a risk dashboard.",
      schema: auditRiskInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      widget: {
        name: "risk-dashboard",
        invoking: "Running risk analysis...",
        invoked: "Risk dashboard ready",
      },
    },
    async ({ traceId, topFlags }: { traceId: string; topFlags: number }) => {
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
    }
  );

  server.tool(
    {
      name: "ml_anomaly_report",
      description:
        "Run embedding-based anomaly detection on a trace, with optional community baseline from shared anonymized traces.",
      schema: mlAnomalyReportInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({
      traceId,
      useCommunityBaseline,
      threshold,
      topAnomalies,
    }: {
      traceId: string;
      useCommunityBaseline: boolean;
      threshold: number;
      topAnomalies: number;
    }) => {
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
    }
  );

  server.tool(
    {
      name: "guard_action",
      description:
        "Approve, block, or set pending state for a specific risky step. Blocking quarantines the trace.",
      schema: guardActionInputSchema,
      outputSchema: guardActionOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({
      traceId,
      stepIndex,
      action,
      reason,
    }: {
      traceId: string;
      stepIndex: number;
      action: "allow" | "block" | "pending";
      reason?: string;
    }) => {
      const updated = setGuardActionForCurrentOwner(traceId, stepIndex, action, reason);
      if (!updated) {
        return error(
          `Unable to update guard action. Check traceId (${traceId}) and stepIndex (${stepIndex}).`
        );
      }

      auditAndPersist(updated);

      return object({
        traceId,
        stepIndex,
        action,
        status: updated.status,
        quarantined: updated.status === "quarantined",
      });
    }
  );
}
