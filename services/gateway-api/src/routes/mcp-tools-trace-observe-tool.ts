import { error, object, widget } from "mcp-use/server";
import { server } from "../state.js";
import {
  getLatestTraceBySessionForCurrentOwner,
  upsertTraceForCurrentOwner,
  auditAndPersist,
  resolveBridgeTarget,
  bridgeOverrideDeniedBody,
} from "../trace-helpers.js";
import { startObservation } from "../bridge/openclaw-bridge.js";
import { toTimelineWidgetProps } from "../core/presenters.js";
import { observeSessionInputSchema } from "../core/tool-schemas.js";
import { zodCompat } from "./mcp-tools-trace-common.js";
import type { Trace } from "@maple/types";

export function registerObserveSessionTool() {
  server.tool(
    {
      name: "observe_session",
      description:
        "Start observing an agent session, store its execution trace, and render a live timeline widget.",
      schema: zodCompat(observeSessionInputSchema),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      widget: {
        name: "trace-timeline",
        invoking: "Connecting to session...",
        invoked: "Trace timeline ready",
      },
    },
    async ({ sessionId, source, bridgeUrl, token, reuseLatest }) => {
      const bridgeTarget = resolveBridgeTarget({
        bridgeUrl,
        token,
      });
      if (bridgeTarget.overrideRejected) {
        return error(bridgeOverrideDeniedBody().reason);
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
                : "Unable to start observation from OpenClaw bridge.",
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
              : "Unable to start observation from OpenClaw bridge.",
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
    },
  );
}
