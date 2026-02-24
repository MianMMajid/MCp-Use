import { useWidget, type WidgetMetadata } from "mcp-use/react";
import type React from "react";
import type { TimelineWidgetProps } from "../../src/core/widget-schemas";
import "../styles.css";

export const widgetMetadata: WidgetMetadata = {
  title: "Trace Timeline",
  description: "Interactive timeline of observed agent execution steps.",
  exposeAsTool: false,
  metadata: {
    autoResize: true,
    prefersBorder: true,
  },
};

const statusTone: Record<string, string> = {
  active: "cc-status-active",
  completed: "cc-status-completed",
  quarantined: "cc-status-quarantined",
};

function riskTone(score: number) {
  if (score >= 80) {
    return "cc-risk-critical";
  }
  if (score >= 60) {
    return "cc-risk-high";
  }
  if (score >= 35) {
    return "cc-risk-medium";
  }
  return "cc-risk-low";
}

const TraceTimelineWidget: React.FC = () => {
  const { props, isPending } = useWidget<TimelineWidgetProps>();

  if (isPending || !props.steps) {
    return (
      <section className="cc-card cc-loading">
        <div className="cc-spinner" />
        <p>Building timeline...</p>
      </section>
    );
  }

  return (
    <section className="cc-card">
      <header className="cc-header">
        <div>
          <p className="cc-eyebrow">Maple Timeline</p>
          <h2>Session {props.sessionId}</h2>
          <p className="cc-meta">
            {props.steps.length} steps • source: {props.source}
          </p>
        </div>
        <div className="cc-summary-grid">
          <span className={`cc-chip ${statusTone[props.status] ?? "cc-status-active"}`}>
            {props.status}
          </span>
          <span className={`cc-chip ${riskTone(props.overallRiskScore)}`}>
            risk {props.overallRiskScore}
          </span>
          <span className="cc-chip cc-chip-muted">flagged {props.flaggedSteps}</span>
        </div>
      </header>

      <div className="cc-timeline" role="list">
        {props.steps.map((step) => (
          <article key={step.index} className="cc-timeline-item" role="listitem">
            <div className={`cc-marker ${riskTone(step.riskScore)}`} aria-hidden />
            <div className="cc-step-main">
              <div className="cc-step-row">
                <strong>Step {step.index}</strong>
                <span className="cc-chip cc-chip-muted">{step.type}</span>
                <span className="cc-chip cc-chip-muted">{step.actor}</span>
                <span className={`cc-chip ${riskTone(step.riskScore)}`}>score {step.riskScore}</span>
                <span className="cc-chip cc-chip-muted">guard {step.guardStatus}</span>
              </div>
              <p>{step.summary}</p>
              {step.flags.length > 0 ? (
                <ul className="cc-flags">
                  {step.flags.slice(0, 3).map((flag) => (
                    <li key={flag.id}>
                      [{flag.severity}] {flag.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

export default TraceTimelineWidget;
