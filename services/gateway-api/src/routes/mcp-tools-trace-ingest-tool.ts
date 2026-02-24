import { z } from "zod";
import { error, object } from "mcp-use/server";
import { server } from "../state.js";
import {
  getTraceForCurrentOwner,
  getLatestTraceBySessionForCurrentOwner,
  createTraceForCurrentOwner,
  upsertTraceForCurrentOwner,
  auditAndPersist,
} from "../trace-helpers.js";
import { stepFromBridgeEvent } from "../bridge/openclaw-bridge.js";
import { zodCompat } from "./mcp-tools-trace-common.js";
import type { OpenClawRawEvent } from "@maple/types";

export function registerIngestSessionEventTool() {
  server.tool(
    {
      name: "ingest_session_event",
      description:
        "Ingest one raw event from an external bridge or webhook into an active trace for near-real-time updates.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      schema: zodCompat(
        z.object({
          traceId: z.string().optional(),
          sessionId: z.string().optional(),
          event: z.object({}).passthrough(),
        }),
      ),
    },
    async ({ traceId, sessionId, event }) => {
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
    },
  );
}
