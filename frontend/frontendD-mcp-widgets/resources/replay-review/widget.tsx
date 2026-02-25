import { useWidget, type WidgetMetadata } from "mcp-use/react";
import type React from "react";
import type { ReplayReviewProps } from "../../src/core/widget-schemas";
import "../styles.css";

export const widgetMetadata: WidgetMetadata = {
  title: "Replay Review",
  description: "Side-by-side comparison of original and forked traces.",
  exposeAsTool: false,
  metadata: {
    autoResize: true,
    prefersBorder: true,
  },
};

function rowTone(score: number) {
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

const ReplayReviewWidget: React.FC = () => {
  const { props, isPending } = useWidget<ReplayReviewProps>();

  if (isPending || !props.originalSteps?.length || !props.originalTraceId || !props.forkedTraceId) {
    return (
      <section className="cc-card cc-loading">
        <div className="cc-spinner" />
        <p>Preparing replay diff...</p>
      </section>
    );
  }

  return (
    <section className="cc-card">
      <header className="cc-header">
        <div>
          <p className="cc-eyebrow">Replay Review</p>
          <h2>
            Forked at step {props.forkStepIndex} • {props.originalTraceId.slice(0, 8)} →{" "}
            {props.forkedTraceId.slice(0, 8)}
          </h2>
          <p className="cc-meta">
            {(props.changedSteps ?? []).length} changed step(s), {(props.addedSteps ?? []).length} appended step(s)
          </p>
        </div>
        <div className="cc-summary-grid">
          <span className="cc-chip cc-chip-muted">changed {(props.changedSteps ?? []).length}</span>
          <span className="cc-chip cc-chip-muted">added {(props.addedSteps ?? []).length}</span>
        </div>
      </header>

      <section className="cc-edit-box">
        <h3>Applied Edits</h3>
        {Object.keys(props.edits ?? {}).length === 0 ? (
          <p>No explicit edits supplied.</p>
        ) : (
          <ul className="cc-flags">
            {Object.entries(props.edits ?? {}).map(([key, value]) => (
              <li key={key}>
                {key}: {JSON.stringify(value)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="cc-split-grid">
        <section className="cc-pane">
          <h3>Original</h3>
          {props.originalSteps.map((step) => (
            <article key={`orig-${step.index}`} className="cc-step-mini">
              <div className="cc-step-row">
                <strong>Step {step.index}</strong>
                <span className={`cc-chip ${rowTone(step.riskScore)}`}>risk {step.riskScore}</span>
              </div>
              <p>{step.summary}</p>
            </article>
          ))}
        </section>

        <section className="cc-pane">
          <h3>Forked</h3>
          {(props.forkedSteps ?? []).map((step) => (
            <article
              key={`fork-${step.index}`}
              className={`cc-step-mini ${(props.changedSteps ?? []).includes(step.index) ? "cc-step-changed" : ""}`}
            >
              <div className="cc-step-row">
                <strong>Step {step.index}</strong>
                <span className={`cc-chip ${rowTone(step.riskScore)}`}>risk {step.riskScore}</span>
              </div>
              <p>{step.summary}</p>
            </article>
          ))}
        </section>
      </div>

      <section className="cc-edit-box">
        <h3>Change Log</h3>
        {(props.changeLog ?? []).length === 0 ? (
          <p>No detectable diffs.</p>
        ) : (
          <ul className="cc-flags">
            {(props.changeLog ?? []).slice(0, 10).map((change, idx) => (
              <li key={`${change.stepIndex}-${change.field}-${idx}`}>
                step {change.stepIndex} • {change.field}
                {change.before ? ` | before: ${change.before}` : ""}
                {change.after ? ` | after: ${change.after}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
};

import { WidgetErrorBoundary } from "../shared/ErrorBoundary";
const WrappedReplayReviewWidget: React.FC = () => <WidgetErrorBoundary><ReplayReviewWidget /></WidgetErrorBoundary>;
export default WrappedReplayReviewWidget;
