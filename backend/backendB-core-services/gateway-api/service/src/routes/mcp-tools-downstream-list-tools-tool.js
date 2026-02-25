import { error, object } from "mcp-use/server";
import { server } from "../state.js";
import { errorMessage } from "../helpers.js";
import { listToolsFromDownstreamCached, resolveDownstreamApp, } from "../firewall-proxy.js";
import { listDownstreamToolsInputSchema } from "../core/tool-schemas.js";
import { zodCompat } from "./mcp-tools-downstream-common.js";
export function registerListDownstreamToolsTool() {
    server.tool({
        name: "list_downstream_tools",
        description: "List tools exposed by a registered downstream MCP app through Maple proxy routing.",
        schema: zodCompat(listDownstreamToolsInputSchema),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ appId }) => {
        let app;
        try {
            app = resolveDownstreamApp(appId);
        }
        catch (configError) {
            return error(errorMessage(configError));
        }
        try {
            const listed = await listToolsFromDownstreamCached(app);
            return object({
                appId: app.id,
                requestId: listed.requestId,
                durationMs: listed.durationMs,
                toolCount: listed.tools.length,
                tools: listed.tools,
            });
        }
        catch (listError) {
            return error(`Downstream tools/list failed: ${errorMessage(listError)}`);
        }
    });
}
//# sourceMappingURL=mcp-tools-downstream-list-tools-tool.js.map