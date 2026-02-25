import { error, object, widget } from "mcp-use/server";
import { z } from "zod";
import { toTimelineWidgetProps } from "../../core/presenters.js";
import { observeSessionInputSchema } from "../../core/tool-schemas.js";
import type { OpenClawRawEvent, Trace } from "../../core/types.js";

interface ToolRegistrar {
  tool: (...args: any[]) => unknown;
}

interface BridgeTargetResolution {
  bridgeUrl: string;
  token: string;
  overrideLocked: boolean;
  overrideRejected: boolean;
}

interface RegisterObservationToolsDeps {
  resolveBridgeTarget: (body: { bridgeUrl?: string; token?: string }) => BridgeTargetResolution;
  bridgeOverrideDeniedBody: () => { reason?: string };
  startObservation: (options: {
    sessionId: string;
    source?: "openclaw" | "auto";
    bridgeUrl?: string;
    token?: string;
  }) => Promise<Trace>;
  getLatestTraceBySessionForCurrentOwner: (sessionId: string) => Trace | undefined;
  getTraceForCurrentOwner: (traceId: string) => Trace | undefined;
  createTraceForCurrentOwner: (base: Omit<Trace, "id" | "startedAt" | "updatedAt">) => Trace;
  upsertTraceForCurrentOwner: (trace: Trace) => Trace;
  auditAndPersist: (
    trace: Trace,
    options?: { useCommunityBaseline?: boolean; threshold?: number }
  ) => { overallRiskScore: number; severity: string };
  stepFromBridgeEvent: (event: OpenClawRawEvent, index: number) => Trace["steps"][number];
}

export function registerObservationTools(
  server: ToolRegistrar,
  deps: RegisterObservationToolsDeps
): void {
  const {
    resolveBridgeTarget,
    bridgeOverrideDeniedBody,
    startObservation,
    getLatestTraceBySessionForCurrentOwner,
    getTraceForCurrentOwner,
    createTraceForCurrentOwner,
    upsertTraceForCurrentOwner,
    auditAndPersist,
    stepFromBridgeEvent,
  } = deps;

  server.tool(
    {
      name: "observe_session",
      description:
        "Start observing an agent session, store its execution trace, and render a live timeline widget.",
      schema: observeSessionInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      widget: {
        name: "trace-timeline",
        invoking: "Connecting to session...",
        invoked: "Trace timeline ready",
      },
    },
    async ({
      sessionId,
      source,
      bridgeUrl,
      token,
      reuseLatest,
    }: {
      sessionId: string;
      source: "openclaw" | "auto";
      bridgeUrl?: string;
      token?: string;
      reuseLatest?: boolean;
    }) => {
      const bridgeTarget = resolveBridgeTarget({
        bridgeUrl,
        token,
      });
      if (bridgeTarget.overrideRejected) {
        return error(bridgeOverrideDeniedBody().reason ?? "Bridge override denied.");
      }

      let trace: Trace;

      if (reuseLatest) {
        const cached = getLatestTraceBySessionForCurrentOwner(sessionId);
        if (cached) {
          trace = cached;
        } else {
          try {
            trace = await startObservation({
              sessionId,
              source,
              bridgeUrl: bridgeTarget.bridgeUrl,
              token: bridgeTarget.token,
            });
          } catch (observeError) {
            return error(
              observeError instanceof Error
                ? observeError.message
                : "Unable to start observation from OpenClaw bridge."
            );
          }
          upsertTraceForCurrentOwner(trace);
        }
      } else {
        try {
          trace = await startObservation({
            sessionId,
            source,
            bridgeUrl: bridgeTarget.bridgeUrl,
            token: bridgeTarget.token,
          });
        } catch (observeError) {
          return error(
            observeError instanceof Error
              ? observeError.message
              : "Unable to start observation from OpenClaw bridge."
          );
        }
        upsertTraceForCurrentOwner(trace);
      }

      const report = auditAndPersist(trace);
      const timelineProps = toTimelineWidgetProps(trace);

      return widget({
        props: timelineProps,
        output: object({
          traceId: trace.id,
          sessionId: trace.sessionId,
          source: trace.source,
          stepCount: trace.steps.length,
          overallRiskScore: report.overallRiskScore,
          severity: report.severity,
          status: trace.status,
        }),
      });
    }
  );

  server.tool(
    {
      name: "ingest_session_event",
      description:
        "Ingest one raw event from an external bridge or webhook into an active trace for near-real-time updates.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      schema: z.object({
        traceId: z.string().optional(),
        sessionId: z.string().optional(),
        event: z.object({}).passthrough(),
      }),
    },
    async ({
      traceId,
      sessionId,
      event,
    }: {
      traceId?: string;
      sessionId?: string;
      event: Record<string, unknown>;
    }) => {
      if (!traceId && !sessionId) {
        return error("Either traceId or sessionId must be provided.");
      }

      let trace = traceId ? getTraceForCurrentOwner(traceId) : undefined;

      if (!trace && sessionId) {
        trace = getLatestTraceBySessionForCurrentOwner(sessionId);
      }

      if (!trace) {
        trace = createTraceForCurrentOwner({
          sessionId: sessionId ?? `manual-${Date.now()}`,
          source: "manual",
          status: "active",
          metadata: {
            mode: "event-ingest",
          },
          steps: [],
        });
      }

      const nextIndex = trace.steps.length;
      const step = stepFromBridgeEvent(event as OpenClawRawEvent, nextIndex);
      trace.steps.push(step);
      upsertTraceForCurrentOwner(trace);

      const report = auditAndPersist(trace);

      return object({
        traceId: trace.id,
        sessionId: trace.sessionId,
        appendedStep: step.index,
        overallRiskScore: report.overallRiskScore,
        status: trace.status,
      });
    }
  );
}
