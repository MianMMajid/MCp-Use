import { useWidget, type WidgetMetadata } from "mcp-use/react";
import type React from "react";
import type { GuardActionWidgetProps } from "../../src/core/widget-schemas";
import "../styles.css";

export const widgetMetadata: WidgetMetadata = {
  title: "Guard Action Confirmation",
  description: "Visual confirmation of a guard approve/block/pend action.",
  exposeAsTool: false,
  metadata: {
    autoResize: true,
    prefersBorder: true,
  },
};

const actionStyle: Record<string, { icon: string; color: string; label: string }> = {
  allow: { icon: "\u2705", color: "#4ade80", label: "Allowed" },
  block: { icon: "\uD83D\uDEAB", color: "#fb7185", label: "Blocked" },
  pending: { icon: "\u23F3", color: "#fbbf24", label: "Pending Review" },
};

const GuardActionWidget: React.FC = () => {
  const { props, isPending } = useWidget<GuardActionWidgetProps>();

  if (isPending || !props.traceId) {
    return (
      <section className="cc-card cc-loading">
        <div className="cc-spinner" />
        <p>Processing guard action...</p>
      </section>
    );
  }

  const style = actionStyle[props.action] ?? actionStyle.pending;

  return (
    <section className="cc-card">
      <header className="cc-header">
        <div>
          <p className="cc-eyebrow">Guard Action</p>
          <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>{style.icon}</span>
            <span style={{ color: style.color }}>{style.label}</span>
          </h2>
        </div>
        {props.quarantined ? (
          <span className="cc-chip" style={{ color: "#fb7185", fontWeight: 700 }}>Quarantined</span>
        ) : null}
      </header>

      <div className="cc-pane">
        <div className="cc-step-row">
          <span className="cc-chip cc-chip-muted">Trace {props.traceId.slice(0, 8)}</span>
          <span className="cc-chip cc-chip-muted">Step #{props.stepIndex}</span>
          {props.stepType ? <span className="cc-chip">{props.stepType}</span> : null}
        </div>

        {props.stepSummary ? (
          <p style={{ margin: "0.5rem 0 0", lineHeight: 1.55 }}>{props.stepSummary}</p>
        ) : null}

        {props.reason ? (
          <div style={{ marginTop: "0.5rem", padding: "0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.06)" }}>
            <p className="cc-eyebrow" style={{ marginBottom: "0.2rem" }}>Reason</p>
            <p style={{ margin: 0, fontSize: "0.88rem" }}>{props.reason}</p>
          </div>
        ) : null}

        {props.updatedStatus ? (
          <div className="cc-step-row" style={{ marginTop: "0.5rem" }}>
            <span className="cc-chip cc-chip-muted">Trace Status: {props.updatedStatus}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default GuardActionWidget;
