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

  if (isPending || !props.title) {
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
          {(() => { const text = props.extract ?? props.summary ?? ""; if (text.length <= 500) return text; const sliced = Array.from(text).slice(0, 500).join(""); return sliced + "\u2026"; })()}
        </p>
        {props.url && /^https?:\/\//i.test(String(props.url).trim()) ? (
          <a href={String(props.url).trim()} target="_blank" rel="noopener noreferrer" className="cc-link" style={{ marginTop: "0.6rem" }}>
            {String(props.url).trim()}
          </a>
        ) : null}
      </div>
    </section>
  );
};

import { WidgetErrorBoundary } from "../shared/ErrorBoundary";
const WrappedWikiCardWidget: React.FC = () => <WidgetErrorBoundary><WikiCardWidget /></WidgetErrorBoundary>;
export default WrappedWikiCardWidget;
