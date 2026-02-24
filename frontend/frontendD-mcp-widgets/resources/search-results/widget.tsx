import { useWidget, type WidgetMetadata } from "mcp-use/react";
import type React from "react";
import type { SearchResultsWidgetProps } from "../../src/core/widget-schemas";
import "../styles.css";

export const widgetMetadata: WidgetMetadata = {
  title: "Search Results",
  description: "Ranked search results with title, URL, and snippet.",
  exposeAsTool: false,
  metadata: {
    autoResize: true,
    prefersBorder: true,
  },
};

const SearchResultsWidget: React.FC = () => {
  const { props, isPending } = useWidget<SearchResultsWidgetProps>();

  if (isPending || !props.results) {
    return (
      <section className="cc-card cc-loading">
        <div className="cc-spinner" />
        <p>Searching...</p>
      </section>
    );
  }

  return (
    <section className="cc-card">
      <header className="cc-header">
        <div>
          <p className="cc-eyebrow">{props.source ?? "Search"}</p>
          <h2>{props.query}</h2>
          <p className="cc-meta">
            {props.results.length} result{props.results.length !== 1 ? "s" : ""}
            {props.totalResults != null ? ` of ${props.totalResults}` : ""}
          </p>
        </div>
      </header>

      <div className="cc-timeline" role="list">
        {props.results.map((item, i) => (
          <article key={i} className="cc-timeline-item" role="listitem">
            <div className="cc-marker cc-risk-low" aria-hidden />
            <div className="cc-step-main">
              <div className="cc-step-row">
                <strong>{item.title}</strong>
                {item.source ? (
                  <span className="cc-chip cc-chip-muted">{item.source}</span>
                ) : null}
              </div>
              {item.url ? (
                <p style={{ fontSize: "0.82rem", color: "var(--cc-accent)" }}>
                  {item.url}
                </p>
              ) : null}
              {item.snippet ? <p>{item.snippet}</p> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

export default SearchResultsWidget;
