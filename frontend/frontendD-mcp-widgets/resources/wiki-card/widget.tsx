import { useWidget, type WidgetMetadata } from "mcp-use/react";
import type React from "react";
import type { WikiCardWidgetProps } from "../../src/core/widget-schemas";
import "../styles.css";

export const widgetMetadata: WidgetMetadata = {
  title: "Wikipedia Summary",
  description: "Wikipedia article summary with link.",
  exposeAsTool: false,
  metadata: {
    autoResize: true,
    prefersBorder: true,
  },
};

const WikiCardWidget: React.FC = () => {
  const { props, isPending } = useWidget<WikiCardWidgetProps>();

  if (isPending) {
    return (
      <section className="cc-card cc-loading">
        <div className="cc-spinner" />
        <p>Loading article...</p>
      </section>
    );
  }

  return (
    <section className="cc-card">
      <header className="cc-header">
        <div>
          <p className="cc-eyebrow">Wikipedia</p>
          <h2>{props.title}</h2>
        </div>
      </header>

      <div className="cc-pane">
        <p style={{ lineHeight: 1.55, margin: 0 }}>
          {props.extract ?? props.summary}
        </p>
        {props.url ? (
          <p style={{ marginTop: "0.6rem", fontSize: "0.82rem", color: "var(--cc-accent)" }}>
            {props.url}
          </p>
        ) : null}
      </div>
    </section>
  );
};

export default WikiCardWidget;
