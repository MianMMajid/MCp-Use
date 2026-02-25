import { error, object, text } from "mcp-use/server";
import { exportTraceInputSchema, listTracesInputSchema } from "../../core/tool-schemas.js";
import type { Trace } from "../../core/types.js";

interface ToolRegistrar {
  tool: (...args: any[]) => unknown;
}

interface RegisterTraceReadToolsDeps {
  listTracesForCurrentOwner: (limit: number, sessionId?: string) => Trace[];
  toTraceSummary: (trace: Trace) => Record<string, unknown>;
  getTraceForCurrentOwner: (traceId: string) => Trace | undefined;
  renderTraceMarkdown: (trace: Trace) => string;
}

export function registerTraceReadTools(server: ToolRegistrar, deps: RegisterTraceReadToolsDeps): void {
  const { getTraceForCurrentOwner, listTracesForCurrentOwner, renderTraceMarkdown, toTraceSummary } = deps;

  server.tool(
    {
      name: "list_traces",
      description: "List recent traces and risk metadata.",
      schema: listTracesInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, sessionId }: { limit: number; sessionId?: string }) => {
      const traces = listTracesForCurrentOwner(limit, sessionId);
      return object({
        count: traces.length,
        traces: traces.map((trace) => toTraceSummary(trace)),
      });
    }
  );

  server.tool(
    {
      name: "export_trace",
      description: "Export a trace in JSON or Markdown format for sharing and debugging.",
      schema: exportTraceInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ traceId, format }: { traceId: string; format: "json" | "markdown" }) => {
      const trace = getTraceForCurrentOwner(traceId);
      if (!trace) {
        return error(`Trace ${traceId} not found.`);
      }

      if (format === "markdown") {
        return text(renderTraceMarkdown(trace));
      }

      return object({
        trace,
      });
    }
  );
}
