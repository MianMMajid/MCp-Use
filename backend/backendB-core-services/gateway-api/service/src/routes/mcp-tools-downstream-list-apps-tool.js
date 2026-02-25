import { object } from "mcp-use/server";
import { server } from "../state.js";
import { downstreamAppRegistry } from "../config.js";
import { listDownstreamAppsInputSchema } from "../core/tool-schemas.js";
import { listDownstreamApps } from "../control/downstream-proxy.js";
import { zodCompat } from "./mcp-tools-downstream-common.js";
export function registerListDownstreamAppsTool() {
    server.tool({
        name: "list_downstream_apps",
        description: "List downstream MCP apps registered behind Maple. Clients should call Maple only and dispatch via this control plane.",
        schema: zodCompat(listDownstreamAppsInputSchema),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ includeDisabled }) => {
        const apps = listDownstreamApps(downstreamAppRegistry, includeDisabled);
        return object({
            count: apps.length,
            apps,
        });
    });
}
//# sourceMappingURL=mcp-tools-downstream-list-apps-tool.js.map