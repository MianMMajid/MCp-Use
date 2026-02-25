import { useWidget, type WidgetMetadata } from "mcp-use/react";
import type React from "react";
import type { ShareConfirmationWidgetProps } from "../../src/core/widget-schemas";
import "../styles.css";

export const widgetMetadata: WidgetMetadata = {
  title: "Share Confirmation",
  description: "Confirmation of anonymized trace sharing with community stats.",
  exposeAsTool: false,
  metadata: { autoResize: true, prefersBorder: true },
};

const ShareConfirmationWidget: React.FC = () => {
  const { props, isPending } = useWidget<ShareConfirmationWidgetProps>();

  if (isPending || !props.traceId) {
    return (
      <section className="cc-card cc-loading">
        <div className="cc-spinner" />
        <p>Sharing trace...</p>
      </section>
    );
  }

  return (
    <section className="cc-card">
      <header className="cc-header">
        <div>
          <p className="cc-eyebrow">Trace Shared</p>
          <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>{"\u2705"}</span> Shared Successfully
          </h2>
        </div>
      </header>

      <div className="cc-pane">
        <div className="cc-step-row">
          <span className="cc-chip cc-chip-muted">Trace {props.traceId.slice(0, 8)}</span>
          {props.sharedId ? (
            <span className="cc-chip cc-chip-muted">Shared ID: {props.sharedId.slice(0, 12)}</span>
          ) : null}
        </div>

        {props.behaviorSignature ? (
          <div style={{ marginTop: "0.5rem" }}>
            <p className="cc-eyebrow" style={{ marginBottom: "0.2rem" }}>Behavior Signature</p>
            <p style={{ margin: 0, fontSize: "0.85rem", fontFamily: "monospace" }}>{props.behaviorSignature}</p>
          </div>
        ) : null}

        {props.communityStats ? (
          <div style={{ marginTop: "0.5rem" }}>
            <p className="cc-eyebrow" style={{ marginBottom: "0.2rem" }}>Community Pool</p>
            <div className="cc-step-row">
              <span className="cc-chip cc-chip-muted">{props.communityStats.totalShared} shared</span>
              <span className="cc-chip cc-chip-muted">{props.communityStats.uniqueSignatures} signatures</span>
            </div>
          </div>
        ) : null}

        {props.previewSuggestions && props.previewSuggestions.length > 0 ? (
          <div style={{ marginTop: "0.5rem" }}>
            <p className="cc-eyebrow" style={{ marginBottom: "0.3rem" }}>Preview Suggestions</p>
            <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.85rem" }}>
              {props.previewSuggestions.map((s, i) => (
                <li key={`suggestion-${i}`} style={{ marginBottom: "0.15rem" }}>{s}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default ShareConfirmationWidget;
