import { registerMcpTraceTools } from "./mcp-tools-trace-tools.js";
import { registerMcpCommunityTools } from "./mcp-tools-community-tools.js";
import { registerMcpWidgetToolOverrides } from "./mcp-tools-widget-overrides.js";
import { registerMcpDownstreamControlTools } from "./mcp-tools-downstream-control.js";
registerMcpTraceTools();
registerMcpCommunityTools();
// Widget-enabled downstream tool overrides take priority over generic proxying.
registerMcpWidgetToolOverrides();
registerMcpDownstreamControlTools();
//# sourceMappingURL=mcp-tools.js.map