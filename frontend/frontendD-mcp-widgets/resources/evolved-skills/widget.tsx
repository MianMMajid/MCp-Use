import { useWidget, type WidgetMetadata } from "mcp-use/react";
import type React from "react";
import type { EvolvedSkillsWidgetProps } from "../../src/core/widget-schemas";
import "../styles.css";

export const widgetMetadata: WidgetMetadata = {
  title: "Evolved Skills",
  description: "Community-sourced evolved skill suggestions.",
  exposeAsTool: false,
  metadata: { autoResize: true, prefersBorder: true },
};

function confidenceBar(confidence: number): string {
  const pct = Math.round(confidence * 100);
  return `${pct}%`;
}

const EvolvedSkillsWidget: React.FC = () => {
  const { props, isPending } = useWidget<EvolvedSkillsWidgetProps>();

  if (isPending || !props.skills) {
    return (
      <section className="cc-card cc-loading">
        <div className="cc-spinner" />
        <p>Analyzing skills...</p>
      </section>
    );
  }

  const skills = props.skills ?? [];

  return (
    <section className="cc-card">
      <header className="cc-header">
        <div>
          <p className="cc-eyebrow">Evolved Skills</p>
          <h2>{props.query}</h2>
        </div>
        <div className="cc-summary-grid">
          <span className="cc-chip">{skills.length} skill{skills.length !== 1 ? "s" : ""}</span>
          {props.communityPoolSize != null ? (
            <span className="cc-chip cc-chip-muted">Pool: {props.communityPoolSize}</span>
          ) : null}
        </div>
      </header>

      {skills.length === 0 ? (
        <div className="cc-pane" style={{ textAlign: "center", padding: "1.5rem 1rem" }}>
          <p style={{ margin: 0, opacity: 0.6 }}>No evolved skills found.</p>
        </div>
      ) : (
        <div className="cc-timeline" role="list">
          {skills.map((skill, i) => (
            <article key={`${skill.label}-${i}`} className="cc-timeline-item" role="listitem">
              <div className="cc-marker cc-risk-low" aria-hidden />
              <div className="cc-step-main">
                <div className="cc-step-row">
                  <strong>{skill.label}</strong>
                  <span className="cc-chip">{confidenceBar(skill.confidence)}</span>
                  {skill.source ? (
                    <span className="cc-chip cc-chip-muted">{skill.source}</span>
                  ) : null}
                </div>
                {skill.description ? (
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", opacity: 0.85 }}>
                    {skill.description}
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default EvolvedSkillsWidget;
