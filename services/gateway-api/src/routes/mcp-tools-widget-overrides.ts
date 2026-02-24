import { registerMcpWidgetSearchTools } from "./mcp-tools-widget-search-tools.js";
import { registerMcpWidgetInfoTools } from "./mcp-tools-widget-info-tools.js";

export function registerMcpWidgetToolOverrides() {
  registerMcpWidgetSearchTools();
  registerMcpWidgetInfoTools();
}
