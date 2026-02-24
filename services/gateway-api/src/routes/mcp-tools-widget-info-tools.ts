import { z } from "zod";
import { error, text, widget } from "mcp-use/server";

import { server } from "../state.js";
import { dispatchWidgetTool, zodCompat } from "./mcp-tools-widget-common.js";

export function registerMcpWidgetInfoTools() {
  server.tool(
    {
      name: "weather_forecast",
      description:
        "Get weather forecast for a location. Returns current conditions and multi-day forecast.",
      schema: zodCompat(z.object({
        location: z.string().describe("City name or location"),
        days: z.number().optional().describe("Number of forecast days"),
        unit: z.string().optional().describe("Temperature unit: celsius or fahrenheit"),
      })),
      widget: {
        name: "weather-card",
        invoking: "Fetching weather...",
        invoked: "Forecast ready",
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ location, days, unit }) => {
      const dispatched = await dispatchWidgetTool({
        toolName: "weather_forecast",
        toolArgs: {
          location,
          ...(days != null ? { days } : {}),
          ...(unit != null ? { unit } : {}),
        },
        failureMessage: "Weather forecast failed.",
      });
      if (!dispatched.ok) {
        return error(dispatched.message);
      }
      return widget({
        props: {
          location,
          unit,
          current: dispatched.raw?.current,
          forecast: Array.isArray(dispatched.raw?.forecast) ? dispatched.raw.forecast : [],
        },
        output: text(dispatched.chainResult.finalResult.dispatch?.textPreview ?? "No forecast"),
      });
    },
  );

  server.tool(
    {
      name: "github_repo_info",
      description:
        "Get information about a GitHub repository including stars, forks, language, and description.",
      schema: zodCompat(z.object({
        repo: z.string().describe("Repository in owner/name format (e.g. 'facebook/react')"),
      })),
      widget: {
        name: "github-card",
        invoking: "Loading repository...",
        invoked: "Repository info ready",
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ repo }) => {
      const dispatched = await dispatchWidgetTool({
        toolName: "github_repo_info",
        toolArgs: { repo },
        failureMessage: "GitHub repo info failed.",
      });
      if (!dispatched.ok) {
        return error(dispatched.message);
      }
      const raw = dispatched.raw;
      return widget({
        props: {
          name: typeof raw?.name === "string" ? raw.name : repo,
          fullName: raw?.fullName ?? raw?.full_name,
          description: raw?.description,
          url: raw?.url ?? raw?.html_url,
          stars: raw?.stars ?? raw?.stargazers_count,
          forks: raw?.forks ?? raw?.forks_count,
          openIssues: raw?.openIssues ?? raw?.open_issues_count,
          language: raw?.language,
          license:
            typeof raw?.license === "object" && raw?.license != null
              ? (raw.license as Record<string, unknown>).name ?? raw.license
              : raw?.license,
          updatedAt: raw?.updatedAt ?? raw?.updated_at,
          owner:
            typeof raw?.owner === "object" && raw?.owner != null
              ? (raw.owner as Record<string, unknown>).login ?? raw.owner
              : raw?.owner,
          topics: Array.isArray(raw?.topics) ? raw.topics : undefined,
        },
        output: text(dispatched.chainResult.finalResult.dispatch?.textPreview ?? "No repository info"),
      });
    },
  );

  server.tool(
    {
      name: "wikipedia_summary",
      description:
        "Get a summary of a Wikipedia article by topic or title.",
      schema: zodCompat(z.object({
        topic: z.string().describe("The Wikipedia article topic or title"),
      })),
      widget: {
        name: "wiki-card",
        invoking: "Loading article...",
        invoked: "Summary ready",
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ topic }) => {
      const dispatched = await dispatchWidgetTool({
        toolName: "wikipedia_summary",
        toolArgs: { topic },
        failureMessage: "Wikipedia summary failed.",
      });
      if (!dispatched.ok) {
        return error(dispatched.message);
      }
      const raw = dispatched.raw;
      return widget({
        props: {
          title: typeof raw?.title === "string" ? raw.title : topic,
          summary:
            typeof raw?.summary === "string"
              ? raw.summary
              : (typeof raw?.extract === "string" ? raw.extract : ""),
          url: raw?.url,
          thumbnail: raw?.thumbnail,
          extract: raw?.extract,
        },
        output: text(dispatched.chainResult.finalResult.dispatch?.textPreview ?? "No summary"),
      });
    },
  );
}
