import { error, object, widget } from "mcp-use/server";
import { server } from "../state.js";
import { getTraceForCurrentOwner, upsertTraceForCurrentOwner, auditAndPersist, } from "../trace-helpers.js";
import { forkTrace } from "../core/forking.js";
import { toReplayWidgetProps } from "../core/presenters.js";
import { replayForkInputSchema } from "../core/tool-schemas.js";
import { zodCompat } from "./mcp-tools-trace-common.js";
export function registerReplayForkTool() {
    server.tool({
        name: "replay_fork",
        description: "Fork a trace at a selected step, apply edits, and replay forward in dry-run mode for safe debugging.",
        schema: zodCompat(replayForkInputSchema),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        widget: {
            name: "replay-review",
            invoking: "Forking trace...",
            invoked: "Replay diff ready",
        },
    }, async ({ traceId, forkStepIndex, edits }) => {
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
        }
        catch (forkError) {
            return error(forkError instanceof Error ? forkError.message : "Unable to fork trace due to unknown error.");
        }
    });
}
//# sourceMappingURL=mcp-tools-trace-replay-tool.js.map
