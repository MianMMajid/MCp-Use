import { registerListDownstreamAppsTool } from "./mcp-tools-downstream-list-apps-tool.js";
import { registerListDownstreamToolsTool } from "./mcp-tools-downstream-list-tools-tool.js";
import { registerDispatchDownstreamTool } from "./mcp-tools-downstream-dispatch-tool.js";
export function registerMcpDownstreamControlTools() {
    registerListDownstreamAppsTool();
    registerListDownstreamToolsTool();
    registerDispatchDownstreamTool();
}
//# sourceMappingURL=mcp-tools-downstream-control.js.map