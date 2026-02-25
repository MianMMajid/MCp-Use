import { error, text, widget } from "mcp-use/server";
import { z } from "zod";

interface WidgetToolRegistrar {
  tool: (...args: any[]) => unknown;
}

interface WidgetDownstreamDispatchResult {
  ok: boolean;
  failure?: string;
  finalResult: {
    dispatch?: {
      result?: unknown;
      textPreview?: string;
    };
  };
}

interface RegisterWidgetDownstreamToolsDeps {
  resolveDispatchAppIds: (options: { includeDefaultExecutionOrder?: boolean }) => string[];
  dispatchDownstreamChainAndLog: (options: {
    appIds: string[];
    toolName: string;
    toolArgs: Record<string, unknown>;
    sessionId: string;
    origin: "mcp";
  }) => Promise<WidgetDownstreamDispatchResult>;
}

interface WidgetToolRunResult {
  textPreview: string;
  raw: Record<string, unknown>;
}

async function runWidgetTool(
  deps: RegisterWidgetDownstreamToolsDeps,
  toolName: string,
  toolArgs: Record<string, unknown>,
  defaultError: string
): Promise<WidgetToolRunResult> {
  const appIds = deps.resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
  const chainResult = await deps.dispatchDownstreamChainAndLog({
    appIds,
    toolName,
    toolArgs,
    sessionId: "chatgpt",
    origin: "mcp",
  });

  if (!chainResult.ok) {
    throw new Error(chainResult.failure ?? defaultError);
  }

  const rawResult = chainResult.finalResult.dispatch?.result;
  const raw =
    rawResult && typeof rawResult === "object" && !Array.isArray(rawResult)
      ? (rawResult as Record<string, unknown>)
      : {};

  return {
    textPreview: chainResult.finalResult.dispatch?.textPreview ?? "",
    raw,
  };
}

export function registerWidgetDownstreamTools(
  server: WidgetToolRegistrar,
  deps: RegisterWidgetDownstreamToolsDeps
): void {
  server.tool(
    {
      name: "web_search",
      description:
        "Search the web for information. Returns ranked results with titles, URLs, and snippets.",
      schema: z.object({
        query: z.string().describe("The search query"),
        maxResults: z.number().optional().describe("Maximum number of results to return"),
      }),
      widget: {
        name: "search-results",
        invoking: "Searching the web...",
        invoked: "Search complete",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, maxResults }: { query: string; maxResults?: number }) => {
      try {
        const { raw, textPreview } = await runWidgetTool(
          deps,
          "web_search",
          { query, ...(maxResults != null ? { maxResults } : {}) },
          "Web search failed."
        );
        const results = Array.isArray(raw.results) ? raw.results : [];
        return widget({
          props: {
            query,
            results,
            totalResults:
              typeof raw.totalResults === "number" ? raw.totalResults : results.length,
            source: "Web",
          },
          output: text(textPreview || "No results"),
        });
      } catch (runError) {
        return error(runError instanceof Error ? runError.message : "Web search failed.");
      }
    }
  );

  server.tool(
    {
      name: "hn_search",
      description: "Search Hacker News for stories, comments, and discussions.",
      schema: z.object({
        query: z.string().describe("The search query"),
        maxResults: z.number().optional().describe("Maximum number of results to return"),
      }),
      widget: {
        name: "search-results",
        invoking: "Searching Hacker News...",
        invoked: "HN search complete",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, maxResults }: { query: string; maxResults?: number }) => {
      try {
        const { raw, textPreview } = await runWidgetTool(
          deps,
          "hn_search",
          { query, ...(maxResults != null ? { maxResults } : {}) },
          "Hacker News search failed."
        );
        const results = Array.isArray(raw.results) ? raw.results : [];
        return widget({
          props: {
            query,
            results,
            totalResults:
              typeof raw.totalResults === "number" ? raw.totalResults : results.length,
            source: "Hacker News",
          },
          output: text(textPreview || "No results"),
        });
      } catch (runError) {
        return error(runError instanceof Error ? runError.message : "Hacker News search failed.");
      }
    }
  );

  server.tool(
    {
      name: "weather_forecast",
      description:
        "Get weather forecast for a location. Returns current conditions and multi-day forecast.",
      schema: z.object({
        location: z.string().describe("City name or location"),
        days: z.number().optional().describe("Number of forecast days"),
        unit: z.string().optional().describe("Temperature unit: celsius or fahrenheit"),
      }),
      widget: {
        name: "weather-card",
        invoking: "Fetching weather...",
        invoked: "Forecast ready",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      location,
      days,
      unit,
    }: {
      location: string;
      days?: number;
      unit?: string;
    }) => {
      try {
        const { raw, textPreview } = await runWidgetTool(
          deps,
          "weather_forecast",
          { location, ...(days != null ? { days } : {}), ...(unit != null ? { unit } : {}) },
          "Weather forecast failed."
        );
        return widget({
          props: {
            location,
            unit,
            current: raw.current,
            forecast: Array.isArray(raw.forecast) ? raw.forecast : [],
          },
          output: text(textPreview || "No forecast"),
        });
      } catch (runError) {
        return error(runError instanceof Error ? runError.message : "Weather forecast failed.");
      }
    }
  );

  server.tool(
    {
      name: "github_repo_info",
      description:
        "Get information about a GitHub repository including stars, forks, language, and description.",
      schema: z.object({
        repo: z
          .string()
          .describe("Repository in owner/name format (e.g. 'facebook/react')"),
      }),
      widget: {
        name: "github-card",
        invoking: "Loading repository...",
        invoked: "Repository info ready",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ repo }: { repo: string }) => {
      try {
        const { raw, textPreview } = await runWidgetTool(
          deps,
          "github_repo_info",
          { repo },
          "GitHub repo info failed."
        );
        return widget({
          props: {
            name: typeof raw.name === "string" ? raw.name : repo,
            fullName: raw.fullName ?? raw.full_name,
            description: raw.description,
            url: raw.url ?? raw.html_url,
            stars: raw.stars ?? raw.stargazers_count,
            forks: raw.forks ?? raw.forks_count,
            openIssues: raw.openIssues ?? raw.open_issues_count,
            language: raw.language,
            license:
              typeof raw.license === "object" && raw.license != null
                ? ((raw.license as Record<string, unknown>).name ?? raw.license)
                : raw.license,
            updatedAt: raw.updatedAt ?? raw.updated_at,
            owner:
              typeof raw.owner === "object" && raw.owner != null
                ? ((raw.owner as Record<string, unknown>).login ?? raw.owner)
                : raw.owner,
            topics: Array.isArray(raw.topics) ? raw.topics : undefined,
          },
          output: text(textPreview || "No repository info"),
        });
      } catch (runError) {
        return error(runError instanceof Error ? runError.message : "GitHub repo info failed.");
      }
    }
  );

  server.tool(
    {
      name: "wikipedia_summary",
      description: "Get a summary of a Wikipedia article by topic or title.",
      schema: z.object({
        topic: z.string().describe("The Wikipedia article topic or title"),
      }),
      widget: {
        name: "wiki-card",
        invoking: "Loading article...",
        invoked: "Summary ready",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ topic }: { topic: string }) => {
      try {
        const { raw, textPreview } = await runWidgetTool(
          deps,
          "wikipedia_summary",
          { topic },
          "Wikipedia summary failed."
        );
        return widget({
          props: {
            title: typeof raw.title === "string" ? raw.title : topic,
            summary:
              typeof raw.summary === "string"
                ? raw.summary
                : typeof raw.extract === "string"
                  ? raw.extract
                  : "",
            url: raw.url,
            thumbnail: raw.thumbnail,
            extract: raw.extract,
          },
          output: text(textPreview || "No summary"),
        });
      } catch (runError) {
        return error(runError instanceof Error ? runError.message : "Wikipedia summary failed.");
      }
    }
  );

  server.tool(
    {
      name: "arxiv_search",
      description:
        "Search arXiv for academic papers. Returns papers with titles, authors, and abstracts.",
      schema: z.object({
        query: z.string().describe("The search query for academic papers"),
        maxResults: z.number().optional().describe("Maximum number of results to return"),
      }),
      widget: {
        name: "arxiv-results",
        invoking: "Searching arXiv...",
        invoked: "Papers found",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, maxResults }: { query: string; maxResults?: number }) => {
      try {
        const { raw, textPreview } = await runWidgetTool(
          deps,
          "arxiv_search",
          { query, ...(maxResults != null ? { maxResults } : {}) },
          "arXiv search failed."
        );
        const results = Array.isArray(raw.results) ? raw.results : [];
        return widget({
          props: {
            query,
            results,
            totalResults:
              typeof raw.totalResults === "number" ? raw.totalResults : results.length,
          },
          output: text(textPreview || "No results"),
        });
      } catch (runError) {
        return error(runError instanceof Error ? runError.message : "arXiv search failed.");
      }
    }
  );

  server.tool(
    {
      name: "openlibrary_search",
      description:
        "Search OpenLibrary for books. Returns books with authors, publication year, and ISBNs.",
      schema: z.object({
        query: z.string().describe("The book search query"),
        maxResults: z.number().optional().describe("Maximum number of results to return"),
      }),
      widget: {
        name: "book-results",
        invoking: "Searching books...",
        invoked: "Books found",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, maxResults }: { query: string; maxResults?: number }) => {
      try {
        const { raw, textPreview } = await runWidgetTool(
          deps,
          "openlibrary_search",
          { query, ...(maxResults != null ? { maxResults } : {}) },
          "OpenLibrary search failed."
        );
        const results = Array.isArray(raw.results) ? raw.results : [];
        return widget({
          props: {
            query,
            results,
            totalResults:
              typeof raw.totalResults === "number" ? raw.totalResults : results.length,
          },
          output: text(textPreview || "No results"),
        });
      } catch (runError) {
        return error(runError instanceof Error ? runError.message : "OpenLibrary search failed.");
      }
    }
  );
}
