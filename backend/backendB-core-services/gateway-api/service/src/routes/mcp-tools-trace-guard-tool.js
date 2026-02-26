import { error, object } from "mcp-use/server";
import { server } from "../state.js";
import { setGuardActionForCurrentOwner, auditAndPersist, } from "../trace-helpers.js";
import { guardActionInputSchema, guardActionOutputSchema, } from "../core/tool-schemas.js";
import { zodCompat } from "./mcp-tools-trace-common.js";
export function registerGuardActionTool() {
    server.tool({
        name: "guard_action",
        description: "Approve, block, or set pending state for a specific risky step. Blocking quarantines the trace.",
        schema: zodCompat(guardActionInputSchema),
        outputSchema: zodCompat(guardActionOutputSchema),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    }, async ({ traceId, stepIndex, action, reason }) => {
        const updated = setGuardActionForCurrentOwner(traceId, stepIndex, action, reason);
        if (!updated) {
            return error(`Unable to update guard action. Check traceId (${traceId}) and stepIndex (${stepIndex}).`);
        }
        auditAndPersist(updated);
        return object({
            traceId,
            stepIndex,
            action,
            status: updated.status,
            quarantined: updated.status === "quarantined",
        });
    });
}
//# sourceMappingURL=mcp-tools-trace-guard-tool.js.map