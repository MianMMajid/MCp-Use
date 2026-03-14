import { useWidget, type WidgetMetadata } from "mcp-use/react";
import type React from "react";
import type { TraceExportWidgetProps } from "../../src/core/widget-schemas";
import "../styles.css";

export const widgetMetadata: WidgetMetadata = {
  title: "Trace Export",
  description: "Exported trace content in JSON or Markdown format.",
  exposeAsTool: false,
  metadata: { autoResize: true, prefersBorder: true },
};

function downloadContent(content: string, format: string, traceId: string) {
  const ext = format === "markdown" ? "md" : "json";
  const mimeType = format === "markdown" ? "text/markdown" : "application/json";
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trace-${traceId.slice(0, 12)}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

function copyToClipboard(content: string) {
  navigator.clipboard.writeText(content);
}

const TraceExportWidget: React.FC = () => {
  const { props, isPending } = useWidget<TraceExportWidgetProps>();

  if (isPending || !props.traceId) {
    return (
      <section className="cc-card cc-loading">
        <div className="cc-spinner" />
        <p>Exporting trace...</p>
      </section>
    );
  }

  const content = String(props.content ?? "");
  const format = String(props.format ?? "json");

  return (
    <section className="cc-card">
      <header className="cc-header">
        <div>
          <p className="cc-eyebrow">Trace Export</p>
          <h2>Trace {props.traceId.slice(0, 12)}</h2>
        </div>
        <div className="cc-summary-grid">
          <span className="cc-chip">{format.toUpperCase()}</span>
          {props.stepCount != null ? (
            <span className="cc-chip cc-chip-muted">{props.stepCount} steps</span>
          ) : null}
          {props.exportedAt ? (
            <span className="cc-chip cc-chip-muted">{props.exportedAt}</span>
          ) : null}
        </div>
      </header>

      <div className="cc-pane">
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <button
            className="cc-chip"
            style={{ cursor: "pointer", border: "1px solid rgba(255,255,255,0.15)" }}
            onClick={() => downloadContent(content, format, props.traceId)}
          >
            Download {format.toUpperCase()}
          </button>
          <button
            className="cc-chip cc-chip-muted"
            style={{ cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={() => copyToClipboard(content)}
          >
            Copy to clipboard
          </button>
        </div>
        <pre
          style={{
            margin: 0,
            fontSize: "0.78rem",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: "400px",
            overflow: "auto",
            background: "rgba(0,0,0,0.06)",
            padding: "0.6rem",
            borderRadius: "6px",
          }}
        >
          {content}
        </pre>
      </div>
    </section>
  );
};

import { WidgetErrorBoundary } from "../shared/ErrorBoundary";
const WrappedTraceExportWidget: React.FC = () => <WidgetErrorBoundary><TraceExportWidget /></WidgetErrorBoundary>;
export default WrappedTraceExportWidget;
