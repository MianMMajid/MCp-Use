import { useWidget, type WidgetMetadata } from "mcp-use/react";
import type React from "react";
import type { GithubCardWidgetProps } from "../../src/core/widget-schemas";
import "../styles.css";

export const widgetMetadata: WidgetMetadata = {
  title: "GitHub Repository",
  description: "GitHub repository stats card with stars, forks, and language.",
  exposeAsTool: false,
  metadata: {
    autoResize: true,
    prefersBorder: true,
  },
};

function formatNumber(n: number | undefined): string {
  if (n == null) return "--";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const GithubCardWidget: React.FC = () => {
  const { props, isPending } = useWidget<GithubCardWidgetProps>();

  if (isPending || !props.name) {
    return (
      <section className="cc-card cc-loading">
        <div className="cc-spinner" />
        <p>Loading repository...</p>
      </section>
    );
  }

  return (
    <section className="cc-card">
      <header className="cc-header">
        <div>
          <p className="cc-eyebrow">GitHub</p>
          <h2>{props.fullName ?? props.name}</h2>
          {props.description ? <p className="cc-meta">{props.description}</p> : null}
        </div>
        <div className="cc-summary-grid">
          {props.language ? (
            <span className="cc-chip cc-chip-muted">{props.language}</span>
          ) : null}
          {props.license ? (
            <span className="cc-chip cc-chip-muted">{props.license}</span>
          ) : null}
        </div>
      </header>

      <div className="cc-pane">
        <div className="cc-step-row">
          <span className="cc-chip">{formatNumber(props.stars)} stars</span>
          <span className="cc-chip">{formatNumber(props.forks)} forks</span>
          {props.openIssues != null ? (
            <span className="cc-chip cc-chip-muted">{formatNumber(props.openIssues)} issues</span>
          ) : null}
        </div>
        {props.owner ? (
          <p className="cc-meta" style={{ marginTop: "0.5rem" }}>
            Owner: {props.owner}
          </p>
        ) : null}
        {props.updatedAt ? (
          <p className="cc-meta">Updated: {props.updatedAt}</p>
        ) : null}
        {props.url && /^https?:\/\//i.test(String(props.url).trim()) ? (
          <a href={String(props.url).trim()} target="_blank" rel="noopener noreferrer" className="cc-link" style={{ marginTop: "0.4rem" }}>
            {String(props.url).trim()}
          </a>
        ) : null}
      </div>

      {props.topics && props.topics.length > 0 ? (
        <div className="cc-step-row" style={{ marginTop: "0.6rem" }}>
          {props.topics.map((topic) => (
            <span key={topic} className="cc-chip cc-chip-muted">
              {topic}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
};

import { WidgetErrorBoundary } from "../shared/ErrorBoundary";
const WrappedGithubCardWidget: React.FC = () => <WidgetErrorBoundary><GithubCardWidget /></WidgetErrorBoundary>;
export default WrappedGithubCardWidget;
