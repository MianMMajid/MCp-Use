import { registerObserveSessionTool } from "./mcp-tools-trace-observe-tool.js";
import { registerReplayForkTool } from "./mcp-tools-trace-replay-tool.js";
import { registerAuditRiskTool, registerMlAnomalyReportTool, } from "./mcp-tools-trace-risk-tools.js";
import { registerGuardActionTool } from "./mcp-tools-trace-guard-tool.js";
import { registerIngestSessionEventTool } from "./mcp-tools-trace-ingest-tool.js";
export function registerMcpTraceTools() {
    registerObserveSessionTool();
    registerReplayForkTool();
    registerAuditRiskTool();
    registerMlAnomalyReportTool();
    registerGuardActionTool();
    registerIngestSessionEventTool();
}
//# sourceMappingURL=mcp-tools-trace-tools.js.map