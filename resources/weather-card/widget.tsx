import { useWidget, type WidgetMetadata } from "mcp-use/react";
import type React from "react";
import type { WeatherCardWidgetProps } from "../../src/core/widget-schemas";
import "../styles.css";

export const widgetMetadata: WidgetMetadata = {
  title: "Weather Forecast",
  description: "Weather forecast card with temperature and conditions.",
  exposeAsTool: false,
  metadata: {
    autoResize: true,
    prefersBorder: true,
  },
};

const weatherIcon: Record<string, string> = {
  clear: "\u2600\uFE0F",
  sunny: "\u2600\uFE0F",
  cloudy: "\u2601\uFE0F",
  overcast: "\u2601\uFE0F",
  rain: "\uD83C\uDF27\uFE0F",
  drizzle: "\uD83C\uDF27\uFE0F",
  snow: "\u2744\uFE0F",
  thunderstorm: "\u26C8\uFE0F",
  fog: "\uD83C\uDF2B\uFE0F",
  mist: "\uD83C\uDF2B\uFE0F",
  wind: "\uD83D\uDCA8",
  partly: "\u26C5",
};

function resolveIcon(condition: string): string {
  const lower = condition.toLowerCase();
  for (const [key, icon] of Object.entries(weatherIcon)) {
    if (lower.includes(key)) return icon;
  }
  return "\uD83C\uDF24\uFE0F";
}

function formatTemp(value: number | undefined, unit?: string): string {
  if (value == null) return "--";
  const suffix = unit?.toLowerCase() === "fahrenheit" ? "\u00B0F" : "\u00B0C";
  return `${Math.round(value)}${suffix}`;
}

const WeatherCardWidget: React.FC = () => {
  const { props, isPending } = useWidget<WeatherCardWidgetProps>();

  if (isPending) {
    return (
      <section className="cc-card cc-loading">
        <div className="cc-spinner" />
        <p>Loading forecast...</p>
      </section>
    );
  }

  return (
    <section className="cc-card">
      <header className="cc-header">
        <div>
          <p className="cc-eyebrow">Weather</p>
          <h2>{props.location}</h2>
        </div>
        {props.current ? (
          <div className="cc-summary-grid">
            <span className="cc-chip" style={{ fontSize: "1.1rem" }}>
              {resolveIcon(props.current.condition)} {formatTemp(props.current.temp ?? props.current.tempHigh, props.unit)}
            </span>
            <span className="cc-chip cc-chip-muted">{props.current.condition}</span>
          </div>
        ) : null}
      </header>

      {props.current ? (
        <div className="cc-pane" style={{ marginBottom: "0.6rem" }}>
          <div className="cc-step-row">
            {props.current.humidity != null ? (
              <span className="cc-chip cc-chip-muted">Humidity {props.current.humidity}%</span>
            ) : null}
            {props.current.wind ? (
              <span className="cc-chip cc-chip-muted">Wind {props.current.wind}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {props.forecast && props.forecast.length > 0 ? (
        <div className="cc-timeline" role="list">
          {props.forecast.map((day, i) => (
            <article key={i} className="cc-timeline-item" role="listitem">
              <div className="cc-marker cc-risk-low" aria-hidden />
              <div className="cc-step-main">
                <div className="cc-step-row">
                  <strong>{day.date ?? `Day ${i + 1}`}</strong>
                  <span style={{ fontSize: "1rem" }}>{resolveIcon(day.condition)}</span>
                  <span className="cc-chip cc-chip-muted">{day.condition}</span>
                  {day.tempHigh != null || day.tempLow != null ? (
                    <span className="cc-chip">
                      {formatTemp(day.tempHigh, props.unit)} / {formatTemp(day.tempLow, props.unit)}
                    </span>
                  ) : day.temp != null ? (
                    <span className="cc-chip">{formatTemp(day.temp, props.unit)}</span>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
};

export default WeatherCardWidget;
