import { useWidget, type WidgetMetadata } from "mcp-use/react";
import type React from "react";
import type { TraceListWidgetProps } from "../../src/core/widget-schemas";
import "../styles.css";

export const widgetMetadata: WidgetMetadata = {
  title: "Trace List",
  description: "Overview list of observed traces with risk metadata.",
  exposeAsTool: false,
  metadata: { autoResize: true, prefersBorder: true },
};

const severityColor: Record<string, string> = {
  critical: "#fb7185",
  high: "#f97316",
  medium: "#fbbf24",
  low: "#4ade80",
};

const TraceListWidget: React.FC = () => {
  const { props, isPending } = useWidget<TraceListWidgetProps>();

  if (isPending || !Array.isArray(props.traces)) {
    return (
      <section className="cc-card cc-loading">
        <div className="cc-spinner" />
        <p>Loading traces...</p>
      </section>
    );
  }

  const traces = props.traces;

  return (
    <section className="cc-card">
      <header className="cc-header">
        <div>
          <p className="cc-eyebrow">Trace Overview</p>
          <h2>{traces.length} Trace{traces.length !== 1 ? "s" : ""}</h2>
          {props.totalCount != null && props.totalCount > traces.length ? (
            <p className="cc-meta">Showing {traces.length} of {props.totalCount}</p>
          ) : null}
        </div>
      </header>

      {traces.length === 0 ? (
        <div className="cc-pane" style={{ textAlign: "center", padding: "1.5rem 1rem" }}>
          <p style={{ margin: 0, opacity: 0.6 }}>No traces found.</p>
        </div>
      ) : (
        <div className="cc-timeline" role="list">
          {traces.slice(0, 50).map((trace, i) => {
            const sev = trace.severity ?? "low";
            return (
              <article key={trace.traceId ?? `trace-${i}`} className="cc-timeline-item" role="listitem">
                <div
                  className="cc-marker"
                  style={{ backgroundColor: severityColor[sev] ?? severityColor.low }}
                  aria-hidden
                />
                <div className="cc-step-main">
                  <div className="cc-step-row">
                    <strong style={{ fontSize: "0.85rem" }}>{trace.traceId}</strong>
                    <span className="cc-chip" style={{ color: severityColor[sev] ?? severityColor.low }}>
                      {sev}
                    </span>
                    {trace.overallRiskScore != null ? (
                      <span className="cc-chip cc-chip-muted">
                        risk: {(trace.overallRiskScore * 100).toFixed(0)}%
                      </span>
                    ) : null}
                  </div>
                  <div className="cc-step-row" style={{ marginTop: "0.2rem" }}>
                    {trace.source ? <span className="cc-chip cc-chip-muted">{trace.source}</span> : null}
                    {trace.status ? <span className="cc-chip cc-chip-muted">{trace.status}</span> : null}
                    {trace.stepCount != null ? (
                      <span className="cc-chip cc-chip-muted">{trace.stepCount} steps</span>
                    ) : null}
                    {trace.updatedAt ? (
                      <span className="cc-chip cc-chip-muted">{trace.updatedAt}</span>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
          {traces.length > 50 ? (
            <p className="cc-meta" style={{ textAlign: "center", padding: "0.5rem" }}>
              …and {traces.length - 50} more traces
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
};

import { WidgetErrorBoundary } from "../shared/ErrorBoundary";
const WrappedTraceListWidget: React.FC = () => <WidgetErrorBoundary><TraceListWidget /></WidgetErrorBoundary>;
export default WrappedTraceListWidget;
