import { useWidget, type WidgetMetadata } from "mcp-use/react";
import type React from "react";
import type { RiskDashboardProps } from "../../src/core/widget-schemas";
import "../styles.css";

export const widgetMetadata: WidgetMetadata = {
  title: "Risk Dashboard",
  description: "Risk score, anomaly flags, and guardrail recommendations for a trace.",
  exposeAsTool: false,
  metadata: {
    autoResize: true,
    prefersBorder: true,
  },
};

function severityClass(severity: RiskDashboardProps["severity"]) {
  switch (severity) {
    case "critical":
      return "cc-risk-critical";
    case "high":
      return "cc-risk-high";
    case "medium":
      return "cc-risk-medium";
    default:
      return "cc-risk-low";
  }
}

const RiskDashboardWidget: React.FC = () => {
  const { props, isPending } = useWidget<RiskDashboardProps>();

  if (isPending || !Array.isArray(props.flags) || !props.traceId) {
    return (
      <section className="cc-card cc-loading">
        <div className="cc-spinner" />
        <p>Running Maple audit...</p>
      </section>
    );
  }

  return (
    <section className="cc-card">
      <header className="cc-header">
        <div>
          <p className="cc-eyebrow">Risk Dashboard</p>
          <h2>Trace {props.traceId.slice(0, 12)}</h2>
          <p className="cc-meta">Status: {props.status}</p>
        </div>
        <span className={`cc-chip ${severityClass(props.severity)}`}>{props.severity}</span>
      </header>

      <div className="cc-gauge-wrap">
        <div className="cc-gauge-track">
          <div
            className={`cc-gauge-value ${severityClass(props.severity)}`}
            style={{ width: `${props.overallRiskScore}%` }}
          />
        </div>
        <div className="cc-gauge-label">overall risk score: {props.overallRiskScore}</div>
      </div>

      <div className="cc-summary-grid">
        <span className="cc-chip cc-risk-critical">critical {props.breakdown.critical}</span>
        <span className="cc-chip cc-risk-high">high {props.breakdown.high}</span>
        <span className="cc-chip cc-risk-medium">medium {props.breakdown.medium}</span>
        <span className="cc-chip cc-risk-low">low {props.breakdown.low}</span>
      </div>

      <section className="cc-edit-box">
        <h3>Top Flags</h3>
        {props.flags.length === 0 ? (
          <p>No risk flags detected.</p>
        ) : (
          <ul className="cc-flags">
            {props.flags.map((flag, idx) => (
              <li key={flag?.id ?? `flag-${idx}`}>
                step {flag.stepIndex} • [{flag.severity}] {flag.message}
                {flag.evidence ? ` (${flag.evidence})` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      {(props.recommendations ?? []).length > 0 ? (
        <section className="cc-edit-box">
          <h3>Guardrail Recommendations</h3>
          <ul className="cc-flags">
            {props.recommendations.map((recommendation, idx) => (
              <li key={`${recommendation}-${idx}`}>{recommendation}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
};

import { WidgetErrorBoundary } from "../shared/ErrorBoundary";
const WrappedRiskDashboardWidget: React.FC = () => <WidgetErrorBoundary><RiskDashboardWidget /></WidgetErrorBoundary>;
export default WrappedRiskDashboardWidget;
