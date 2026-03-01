import { useWidget, type WidgetMetadata } from "mcp-use/react";
import type React from "react";
import type { BookResultsWidgetProps } from "../../src/core/widget-schemas";
import { isSafeUrl } from '../shared/url-validation';
import "../styles.css";

export const widgetMetadata: WidgetMetadata = {
  title: "Book Results",
  description: "Book search results from OpenLibrary.",
  exposeAsTool: false,
  metadata: {
    autoResize: true,
    prefersBorder: true,
  },
};

const BookResultsWidget: React.FC = () => {
  const { props, isPending } = useWidget<BookResultsWidgetProps>();

  if (isPending || !props.results) {
    return (
      <section className="cc-card cc-loading">
        <div className="cc-spinner" />
        <p>Searching books...</p>
      </section>
    );
  }

  return (
    <section className="cc-card">
      <header className="cc-header">
        <div>
          <p className="cc-eyebrow">OpenLibrary</p>
          <h2>{props.query}</h2>
          <p className="cc-meta">
            {props.results.length} book{props.results.length !== 1 ? "s" : ""}
            {props.totalResults != null ? ` of ${props.totalResults}` : ""}
          </p>
        </div>
      </header>

      {props.results.length === 0 ? (
        <div className="cc-pane" style={{ textAlign: "center", padding: "1.5rem 1rem" }}>
          <p style={{ margin: 0, opacity: 0.6, fontSize: "0.9rem" }}>No books found for &ldquo;{props.query}&rdquo;.</p>
        </div>
      ) : (
        <div className="cc-timeline" role="list">
          {props.results.slice(0, 50).map((book, i) => (
            <article key={book.isbn ?? book.url ?? `book-${i}`} className="cc-timeline-item" role="listitem">
              <div className="cc-marker cc-risk-low" aria-hidden />
              <div className="cc-step-main">
                <div className="cc-step-row">
                  <strong title={book.title} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "280px", display: "inline-block" }}>{book.title}</strong>
                  {book.firstPublishYear != null ? (
                    <span className="cc-chip cc-chip-muted">{book.firstPublishYear}</span>
                  ) : null}
                </div>
                {book.authors && book.authors.length > 0 ? (
                  <p className="cc-meta" style={{ marginTop: "0.3rem" }}>
                    {book.authors.join(", ")}
                  </p>
                ) : null}
                <div className="cc-step-row" style={{ marginTop: "0.3rem" }}>
                  {book.publisher ? (
                    <span className="cc-chip cc-chip-muted">{book.publisher}</span>
                  ) : null}
                  {book.isbn ? (
                    <span className="cc-chip cc-chip-muted">ISBN {book.isbn}</span>
                  ) : null}
                </div>
                {isSafeUrl(book.url) ? (
                  <a href={book.url.trim()} target="_blank" rel="noopener noreferrer" className="cc-link">
                    {book.url.trim()}
                  </a>
                ) : null}
              </div>
            </article>
          ))}
          {props.results.length > 50 ? (
            <p className="cc-meta" style={{ textAlign: "center", padding: "0.5rem" }}>
              …and {props.results.length - 50} more books
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
};

import { WidgetErrorBoundary } from "../shared/ErrorBoundary";
const WrappedBookResultsWidget: React.FC = () => <WidgetErrorBoundary><BookResultsWidget /></WidgetErrorBoundary>;
export default WrappedBookResultsWidget;
