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

  return (
    <section className="cc-card">
      <header className="cc-header">
        <div>
          <p className="cc-eyebrow">Trace Export</p>
          <h2>Trace {props.traceId.slice(0, 12)}</h2>
        </div>
        <div className="cc-summary-grid">
          <span className="cc-chip">{props.format.toUpperCase()}</span>
          {props.stepCount != null ? (
            <span className="cc-chip cc-chip-muted">{props.stepCount} steps</span>
          ) : null}
          {props.exportedAt ? (
            <span className="cc-chip cc-chip-muted">{props.exportedAt}</span>
          ) : null}
        </div>
      </header>

      <div className="cc-pane">
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
          {props.content}
        </pre>
      </div>
    </section>
  );
};

import { WidgetErrorBoundary } from "../shared/ErrorBoundary";
const WrappedTraceExportWidget: React.FC = () => <WidgetErrorBoundary><TraceExportWidget /></WidgetErrorBoundary>;
export default WrappedTraceExportWidget;
