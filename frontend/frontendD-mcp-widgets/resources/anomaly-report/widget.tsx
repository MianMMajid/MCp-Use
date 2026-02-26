import { useWidget, type WidgetMetadata } from "mcp-use/react";
import type React from "react";
import type { AnomalyReportWidgetProps, AnomalyFlag } from "../../src/core/widget-schemas";
import "../styles.css";

export const widgetMetadata: WidgetMetadata = {
  title: "ML Anomaly Report",
  description: "Anomaly detection results with community baseline comparison.",
  exposeAsTool: false,
  metadata: {
    autoResize: true,
    prefersBorder: true,
  },
};

const severityColor: Record<string, string> = {
  critical: "#fb7185",
  high: "#f97316",
  medium: "#fbbf24",
  low: "#4ade80",
};

function formatScore(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return (value * 100).toFixed(1) + "%";
}

function severityLabel(severity: string): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

const AnomalyReportWidget: React.FC = () => {
  const { props, isPending } = useWidget<AnomalyReportWidgetProps>();

  if (isPending || !props.traceId) {
    return (
      <section className="cc-card cc-loading">
        <div className="cc-spinner" />
        <p>Analyzing anomalies...</p>
      </section>
    );
  }

  const anomalies = props.anomalies ?? [];
  const baseline = props.communityBaseline;
  const scoreColor = props.overallAnomalyScore > 0.7 ? severityColor.critical
    : props.overallAnomalyScore > 0.4 ? severityColor.high
    : props.overallAnomalyScore > 0.2 ? severityColor.medium
    : severityColor.low;

  return (
    <section className="cc-card">
      <header className="cc-header">
        <div>
          <p className="cc-eyebrow">ML Anomaly Report</p>
          <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            Score: <span style={{ color: scoreColor }}>{formatScore(props.overallAnomalyScore)}</span>
          </h2>
        </div>
        <div className="cc-summary-grid">
          <span className="cc-chip">{anomalies.length} anomal{anomalies.length === 1 ? "y" : "ies"}</span>
          <span className="cc-chip cc-chip-muted">Trace {props.traceId.slice(0, 8)}</span>
        </div>
      </header>

      {baseline ? (
        <div className="cc-pane" style={{ marginBottom: "0.6rem" }}>
          <p className="cc-eyebrow" style={{ marginBottom: "0.3rem" }}>Community Baseline</p>
          <div className="cc-step-row">
            <span className="cc-chip cc-chip-muted">Mean Risk: {formatScore(baseline.meanRisk)}</span>
            <span className="cc-chip cc-chip-muted">Std Dev: {Number.isFinite(baseline.stdRisk) ? baseline.stdRisk.toFixed(3) : "--"}</span>
            <span className="cc-chip cc-chip-muted">Sample: {baseline.sampleSize}</span>
          </div>
        </div>
      ) : null}

      {props.summary ? (
        <div className="cc-pane" style={{ marginBottom: "0.6rem" }}>
          <p style={{ lineHeight: 1.55, margin: 0 }}>{props.summary}</p>
        </div>
      ) : null}

      {anomalies.length > 0 ? (
        <div className="cc-timeline" role="list">
          {anomalies.slice(0, 30).map((anomaly: AnomalyFlag, i: number) => (
            <article key={`${anomaly.metric}-${i}`} className="cc-timeline-item" role="listitem">
              <div
                className="cc-marker"
                style={{ backgroundColor: severityColor[anomaly.severity] ?? severityColor.medium }}
                aria-hidden
              />
              <div className="cc-step-main">
                <div className="cc-step-row">
                  <strong>{anomaly.metric}</strong>
                  <span className="cc-chip" style={{ color: severityColor[anomaly.severity] ?? severityColor.medium }}>
                    {severityLabel(anomaly.severity)}
                  </span>
                  <span className="cc-chip cc-chip-muted">z={Number.isFinite(anomaly.zScore) ? anomaly.zScore.toFixed(2) : "--"}</span>
                </div>
                <div className="cc-step-row" style={{ marginTop: "0.2rem" }}>
                  <span className="cc-chip cc-chip-muted">Observed: {Number.isFinite(anomaly.observed) ? anomaly.observed.toFixed(3) : "--"}</span>
                  <span className="cc-chip cc-chip-muted">Baseline: {Number.isFinite(anomaly.baseline) ? anomaly.baseline.toFixed(3) : "--"}</span>
                </div>
                {anomaly.description ? (
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", opacity: 0.85 }}>{anomaly.description}</p>
                ) : null}
              </div>
            </article>
          ))}
          {anomalies.length > 30 ? (
            <p className="cc-meta" style={{ textAlign: "center", padding: "0.5rem" }}>
              …and {anomalies.length - 30} more anomalies
            </p>
          ) : null}
        </div>
      ) : (
        <div className="cc-pane">
          <p style={{ margin: 0, opacity: 0.7 }}>No anomalies detected.</p>
        </div>
      )}
    </section>
  );
};

import { WidgetErrorBoundary } from "../shared/ErrorBoundary";
const WrappedAnomalyReportWidget: React.FC = () => <WidgetErrorBoundary><AnomalyReportWidget /></WidgetErrorBoundary>;
export default WrappedAnomalyReportWidget;
