import { z } from "zod";
import { error, text, widget } from "mcp-use/server";

import { server } from "../state.js";
import { dispatchWidgetTool, zodCompat } from "./mcp-tools-widget-common.js";

export function registerMcpWidgetSearchTools() {
  server.tool(
    {
      name: "web_search",
      description:
        "Search the web for information. Returns ranked results with titles, URLs, and snippets.",
      schema: zodCompat(z.object({
        query: z.string().describe("The search query"),
        maxResults: z.number().optional().describe("Maximum number of results to return"),
      })),
      widget: {
        name: "search-results",
        invoking: "Searching the web...",
        invoked: "Search complete",
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ query, maxResults }) => {
      const dispatched = await dispatchWidgetTool({
        toolName: "web_search",
        toolArgs: { query, ...(maxResults != null ? { maxResults } : {}) },
        failureMessage: "Web search failed.",
      });
      if (!dispatched.ok) {
        return error(dispatched.message);
      }
      const results = Array.isArray(dispatched.raw?.results) ? dispatched.raw.results : [];
      return widget({
        props: {
          query,
          results,
          totalResults:
            typeof dispatched.raw?.totalResults === "number" ? dispatched.raw.totalResults : results.length,
          source: "Web",
        },
        output: text(dispatched.chainResult.finalResult.dispatch?.textPreview ?? "No results"),
      });
    },
  );

  server.tool(
    {
      name: "hn_search",
      description:
        "Search Hacker News for stories, comments, and discussions.",
      schema: zodCompat(z.object({
        query: z.string().describe("The search query"),
        maxResults: z.number().optional().describe("Maximum number of results to return"),
      })),
      widget: {
        name: "search-results",
        invoking: "Searching Hacker News...",
        invoked: "HN search complete",
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ query, maxResults }) => {
      const dispatched = await dispatchWidgetTool({
        toolName: "hn_search",
        toolArgs: { query, ...(maxResults != null ? { maxResults } : {}) },
        failureMessage: "Hacker News search failed.",
      });
      if (!dispatched.ok) {
        return error(dispatched.message);
      }
      const results = Array.isArray(dispatched.raw?.results) ? dispatched.raw.results : [];
      return widget({
        props: {
          query,
          results,
          totalResults:
            typeof dispatched.raw?.totalResults === "number" ? dispatched.raw.totalResults : results.length,
          source: "Hacker News",
        },
        output: text(dispatched.chainResult.finalResult.dispatch?.textPreview ?? "No results"),
      });
    },
  );

  server.tool(
    {
      name: "arxiv_search",
      description:
        "Search arXiv for academic papers. Returns papers with titles, authors, and abstracts.",
      schema: zodCompat(z.object({
        query: z.string().describe("The search query for academic papers"),
        maxResults: z.number().optional().describe("Maximum number of results to return"),
      })),
      widget: {
        name: "arxiv-results",
        invoking: "Searching arXiv...",
        invoked: "Papers found",
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ query, maxResults }) => {
      const dispatched = await dispatchWidgetTool({
        toolName: "arxiv_search",
        toolArgs: { query, ...(maxResults != null ? { maxResults } : {}) },
        failureMessage: "arXiv search failed.",
      });
      if (!dispatched.ok) {
        return error(dispatched.message);
      }
      const results = Array.isArray(dispatched.raw?.results) ? dispatched.raw.results : [];
      return widget({
        props: {
          query,
          results,
          totalResults:
            typeof dispatched.raw?.totalResults === "number" ? dispatched.raw.totalResults : results.length,
        },
        output: text(dispatched.chainResult.finalResult.dispatch?.textPreview ?? "No results"),
      });
    },
  );

  server.tool(
    {
      name: "openlibrary_search",
      description:
        "Search OpenLibrary for books. Returns books with authors, publication year, and ISBNs.",
      schema: zodCompat(z.object({
        query: z.string().describe("The book search query"),
        maxResults: z.number().optional().describe("Maximum number of results to return"),
      })),
      widget: {
        name: "book-results",
        invoking: "Searching books...",
        invoked: "Books found",
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ query, maxResults }) => {
      const dispatched = await dispatchWidgetTool({
        toolName: "openlibrary_search",
        toolArgs: { query, ...(maxResults != null ? { maxResults } : {}) },
        failureMessage: "OpenLibrary search failed.",
      });
      if (!dispatched.ok) {
        return error(dispatched.message);
      }
      const results = Array.isArray(dispatched.raw?.results) ? dispatched.raw.results : [];
      return widget({
        props: {
          query,
          results,
          totalResults:
            typeof dispatched.raw?.totalResults === "number" ? dispatched.raw.totalResults : results.length,
        },
        output: text(dispatched.chainResult.finalResult.dispatch?.textPreview ?? "No results"),
      });
    },
  );
}
