import { useWidget, type WidgetMetadata } from "mcp-use/react";
import type React from "react";
import type { ArxivResultsWidgetProps } from "../../src/core/widget-schemas";
import { isSafeUrl } from '../shared/url-validation';
import "../styles.css";

export const widgetMetadata: WidgetMetadata = {
  title: "arXiv Results",
  description: "Academic paper search results from arXiv.",
  exposeAsTool: false,
  metadata: {
    autoResize: true,
    prefersBorder: true,
  },
};

const ArxivResultsWidget: React.FC = () => {
  const { props, isPending } = useWidget<ArxivResultsWidgetProps>();

  if (isPending || !props.results) {
    return (
      <section className="cc-card cc-loading">
        <div className="cc-spinner" />
        <p>Searching arXiv...</p>
      </section>
    );
  }

  return (
    <section className="cc-card">
      <header className="cc-header">
        <div>
          <p className="cc-eyebrow">arXiv</p>
          <h2>{props.query}</h2>
          <p className="cc-meta">
            {props.results.length} paper{props.results.length !== 1 ? "s" : ""}
            {props.totalResults != null ? ` of ${props.totalResults}` : ""}
          </p>
        </div>
      </header>

      {props.results.length === 0 ? (
        <div className="cc-pane" style={{ textAlign: "center", padding: "1.5rem 1rem" }}>
          <p style={{ margin: 0, opacity: 0.6, fontSize: "0.9rem" }}>No papers found for &ldquo;{props.query}&rdquo;.</p>
        </div>
      ) : (
        <div className="cc-timeline" role="list">
          {props.results.slice(0, 50).map((paper, i) => (
            <article key={paper.url ?? `paper-${i}`} className="cc-timeline-item" role="listitem">
              <div className="cc-marker cc-risk-low" aria-hidden />
              <div className="cc-step-main">
                <div className="cc-step-row">
                  <strong>{paper.title}</strong>
                  {paper.published ? (
                    <span className="cc-chip cc-chip-muted">{paper.published}</span>
                  ) : null}
                </div>
                {paper.authors && paper.authors.length > 0 ? (
                  <p className="cc-meta" style={{ marginTop: "0.3rem" }}>
                    {paper.authors.join(", ")}
                  </p>
                ) : null}
                {paper.categories && paper.categories.length > 0 ? (
                  <div className="cc-step-row" style={{ marginTop: "0.3rem" }}>
                    {paper.categories.map((cat) => (
                      <span key={cat} className="cc-chip cc-chip-muted">
                        {cat}
                      </span>
                    ))}
                  </div>
                ) : null}
                {paper.summary ? (
                  <p>
                    {paper.summary.length > 300
                      ? `${paper.summary.slice(0, 300)}...`
                      : paper.summary}
                  </p>
                ) : null}
                {isSafeUrl(paper.url) ? (
                  <a href={paper.url.trim()} target="_blank" rel="noopener noreferrer" className="cc-link">
                    {paper.url.trim()}
                  </a>
                ) : null}
              </div>
            </article>
          ))}
          {props.results.length > 50 ? (
            <p className="cc-meta" style={{ textAlign: "center", padding: "0.5rem" }}>
              …and {props.results.length - 50} more papers
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
};

import { WidgetErrorBoundary } from "../shared/ErrorBoundary";
const WrappedArxivResultsWidget: React.FC = () => <WidgetErrorBoundary><ArxivResultsWidget /></WidgetErrorBoundary>;
export default WrappedArxivResultsWidget;
