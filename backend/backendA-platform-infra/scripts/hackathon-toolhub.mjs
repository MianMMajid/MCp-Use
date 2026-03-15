#!/usr/bin/env node

import { createServer } from "node:http";

const TOOLHUB_PORT_RAW = Number.parseInt(String(process.env.MAPLE_TOOLHUB_PORT ?? "8788"), 10);
const TOOLHUB_PORT = Number.isFinite(TOOLHUB_PORT_RAW)
  ? Math.max(1024, Math.min(65535, TOOLHUB_PORT_RAW))
  : 8788;
const REQUEST_TIMEOUT_MS_RAW = Number.parseInt(
  String(process.env.MAPLE_TOOLHUB_TIMEOUT_MS ?? "12000"),
  10
);
const REQUEST_TIMEOUT_MS = Number.isFinite(REQUEST_TIMEOUT_MS_RAW)
  ? Math.max(2_000, Math.min(60_000, REQUEST_TIMEOUT_MS_RAW))
  : 12_000;
const MAX_BODY_BYTES = 1_000_000;

const TOOL_DEFINITIONS = [
  {
    name: "web_search",
    description:
      "Search the public web for a query and return ranked snippets with URLs.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 2 },
        maxResults: { type: "integer", minimum: 1, maximum: 10, default: 5 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "web_fetch",
    description:
      "Fetch and extract readable content from a public web page URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri" },
        maxChars: { type: "integer", minimum: 500, maximum: 30000, default: 8000 },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "wikipedia_summary",
    description:
      "Get a concise summary for a Wikipedia topic title.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1 },
        lang: { type: "string", default: "en" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "github_repo_info",
    description:
      "Get public metadata and health signals for a GitHub repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", minLength: 1 },
        repo: { type: "string", minLength: 1 },
      },
      required: ["owner", "repo"],
      additionalProperties: false,
    },
  },
  {
    name: "weather_forecast",
    description:
      "Get a short multi-day weather forecast for a location using Open-Meteo.",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string", minLength: 1 },
        days: { type: "integer", minimum: 1, maximum: 7, default: 3 },
        unit: { type: "string", enum: ["c", "f"], default: "c" },
      },
      required: ["location"],
      additionalProperties: false,
    },
  },
  {
    name: "slack_post_message",
    description:
      "Send a message to Slack via incoming webhook or bot token.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", minLength: 1 },
        channel: { type: "string" },
        threadTs: { type: "string" },
        unfurlLinks: { type: "boolean", default: false },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "hn_search",
    description:
      "Search Hacker News stories/comments with ranking metadata.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 2 },
        tags: {
          type: "string",
          enum: ["all", "story", "comment", "ask_hn", "show_hn", "job"],
          default: "story",
        },
        maxResults: { type: "integer", minimum: 1, maximum: 20, default: 5 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "arxiv_search",
    description:
      "Search arXiv papers and return titles, authors, abstracts, and links.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 2 },
        maxResults: { type: "integer", minimum: 1, maximum: 10, default: 5 },
        sortBy: {
          type: "string",
          enum: ["relevance", "lastUpdatedDate", "submittedDate"],
          default: "relevance",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "openlibrary_search",
    description:
      "Search OpenLibrary for books with authors, year, and canonical URLs.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 2 },
        maxResults: { type: "integer", minimum: 1, maximum: 10, default: 5 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

function asString(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function asObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeUrl(value) {
  const raw = asString(value);
  if (!raw) {
    throw new Error("url is required.");
  }
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("url must use http or https.");
  }
  return parsed.toString();
}

function truncate(value, maxChars = 8000) {
  const text = String(value ?? "");
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}...`;
}

function stripHtml(input) {
  return String(input ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(input) {
  return String(input ?? "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function normalizeWhitespace(value) {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function extractXmlTag(xml, tagName) {
  const match = String(xml).match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? normalizeWhitespace(match[1]) : "";
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return body;
}

function okToolResult(toolName, data, text) {
  const message = truncate(text, 12000);
  return {
    text: message,
    content: [{ type: "text", text: message }],
    structuredContent: {
      tool: toolName,
      data,
    },
  };
}

function flattenDuckTopics(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  const out = [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    if (Array.isArray(item.Topics)) {
      out.push(...flattenDuckTopics(item.Topics));
      continue;
    }
    out.push(item);
  }
  return out;
}

async function runWebSearch(argumentsInput) {
  const args = asObject(argumentsInput);
  const query = asString(args.query);
  if (!query) {
    throw new Error("query is required.");
  }
  const maxResults = clamp(Math.trunc(asNumber(args.maxResults) ?? 5), 1, 10);
  const endpoint = `https://api.duckduckgo.com/?q=${encodeURIComponent(
    query
  )}&format=json&no_html=1&skip_disambig=1`;
  const payload = await fetchJson(endpoint, {
    headers: {
      accept: "application/json",
      "user-agent": "maple-hackathon-toolhub/1.0",
    },
  });

  const results = [];
  const heading = asString(payload.Heading);
  const abstract = asString(payload.AbstractText);
  const abstractUrl = asString(payload.AbstractURL);
  if (heading || abstract) {
    results.push({
      title: heading ?? query,
      url: abstractUrl ?? "",
      snippet: abstract ?? "",
      source: "duckduckgo",
    });
  }

  const related = flattenDuckTopics(payload.RelatedTopics);
  for (const item of related) {
    const title = asString(item.Text);
    const url = asString(item.FirstURL);
    if (!title || !url) {
      continue;
    }
    results.push({
      title,
      url,
      snippet: title,
      source: "duckduckgo",
    });
    if (results.length >= maxResults) {
      break;
    }
  }

  const ranked = results.slice(0, maxResults);
  const text = ranked.length
    ? ranked
        .map((entry, index) => `${index + 1}. ${entry.title}\n${entry.url}\n${entry.snippet}`)
        .join("\n\n")
    : `No search results found for "${query}".`;

  return okToolResult("web_search", { query, count: ranked.length, results: ranked }, text);
}

async function runWebFetch(argumentsInput) {
  const args = asObject(argumentsInput);
  const url = normalizeUrl(args.url);
  const maxChars = clamp(Math.trunc(asNumber(args.maxChars) ?? 8000), 500, 30000);
  const withoutScheme = url.replace(/^https?:\/\//i, "");
  const jinaUrl = `https://r.jina.ai/http://${withoutScheme}`;

  let text = "";
  let source = "r.jina.ai";
  try {
    const viaJina = await fetchWithTimeout(jinaUrl, {
      headers: {
        accept: "text/plain, text/markdown;q=0.9, */*;q=0.8",
        "user-agent": "maple-hackathon-toolhub/1.0",
      },
    });
    text = await viaJina.text();
    if (!viaJina.ok || !text.trim()) {
      throw new Error(`jina fetch failed (${viaJina.status})`);
    }
  } catch {
    source = "direct";
    const direct = await fetchWithTimeout(url, {
      headers: {
        accept: "text/html, text/plain;q=0.9, */*;q=0.8",
        "user-agent": "maple-hackathon-toolhub/1.0",
      },
    });
    const raw = await direct.text();
    text = stripHtml(raw);
  }

  const summary = truncate(text.replace(/\s+\n/g, "\n").trim(), maxChars);
  const message = summary.length > 0 ? summary : `Fetched ${url} but content was empty.`;
  return okToolResult(
    "web_fetch",
    {
      url,
      source,
      content: message,
      contentLength: message.length,
    },
    message
  );
}

async function runWikipediaSummary(argumentsInput) {
  const args = asObject(argumentsInput);
  const title = asString(args.title);
  if (!title) {
    throw new Error("title is required.");
  }
  const langRaw = asString(args.lang) ?? "en";
  const lang = /^[a-z]{2,5}$/i.test(langRaw) ? langRaw.toLowerCase() : "en";
  const endpoint = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title
  )}`;
  const payload = await fetchJson(endpoint, {
    headers: {
      accept: "application/json",
      "user-agent": "maple-hackathon-toolhub/1.0",
    },
  });

  const normalized = {
    title: asString(payload.title) ?? title,
    description: asString(payload.description) ?? "",
    extract: asString(payload.extract) ?? "",
    url:
      asString(payload?.content_urls?.desktop?.page) ??
      asString(payload?.content_urls?.mobile?.page) ??
      "",
  };
  const text = [
    normalized.title,
    normalized.description,
    normalized.extract,
    normalized.url,
  ]
    .filter((value) => value && value.length > 0)
    .join("\n");
  return okToolResult("wikipedia_summary", normalized, text);
}

async function runGithubRepoInfo(argumentsInput) {
  const args = asObject(argumentsInput);
  const owner = asString(args.owner);
  const repo = asString(args.repo);
  if (!owner || !repo) {
    throw new Error("owner and repo are required.");
  }
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  try {
    const payload = await fetchJson(endpoint, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "maple-hackathon-toolhub/1.0",
      },
    });

    const data = {
      source: "github_api",
      fullName: asString(payload.full_name) ?? `${owner}/${repo}`,
      description: asString(payload.description) ?? "",
      stars: asNumber(payload.stargazers_count) ?? 0,
      forks: asNumber(payload.forks_count) ?? 0,
      openIssues: asNumber(payload.open_issues_count) ?? 0,
      language: asString(payload.language) ?? "",
      license: asString(payload?.license?.spdx_id) ?? "",
      url: asString(payload.html_url) ?? `https://github.com/${owner}/${repo}`,
      pushedAt: asString(payload.pushed_at) ?? "",
      updatedAt: asString(payload.updated_at) ?? "",
    };
    const text = [
      data.fullName,
      data.description,
      `Stars: ${data.stars} | Forks: ${data.forks} | Open issues: ${data.openIssues}`,
      `Language: ${data.language || "n/a"} | License: ${data.license || "n/a"}`,
      `URL: ${data.url}`,
    ]
      .filter((value) => value.length > 0)
      .join("\n");
    return okToolResult("github_repo_info", data, text);
  } catch {
    const htmlUrl = `https://github.com/${owner}/${repo}`;
    const fallbackUrl = `https://r.jina.ai/http://github.com/${owner}/${repo}`;
    const fallbackResponse = await fetchWithTimeout(fallbackUrl, {
      headers: {
        accept: "text/plain, text/markdown;q=0.9, */*;q=0.8",
        "user-agent": "maple-hackathon-toolhub/1.0",
      },
    });
    const raw = await fallbackResponse.text();
    const excerpt = truncate(raw, 2400);
    const descriptionLine = excerpt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("Title:") && !line.startsWith("URL Source:"));
    const data = {
      source: "github_web_fallback",
      fullName: `${owner}/${repo}`,
      description: descriptionLine ?? "",
      url: htmlUrl,
      excerpt,
    };
    const text = [
      `${data.fullName} (fallback mode)`,
      data.description,
      `URL: ${data.url}`,
      "",
      excerpt,
    ]
      .filter((value) => value.length > 0)
      .join("\n");
    return okToolResult("github_repo_info", data, text);
  }
}

function weatherCodeLabel(code) {
  const map = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Heavy rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
  };
  return map[code] ?? `Weather code ${code}`;
}

async function runWeatherForecast(argumentsInput) {
  const args = asObject(argumentsInput);
  const location = asString(args.location);
  if (!location) {
    throw new Error("location is required.");
  }
  const days = clamp(Math.trunc(asNumber(args.days) ?? 3), 1, 7);
  const unitRaw = (asString(args.unit) ?? "c").toLowerCase();
  const unit = unitRaw === "f" ? "f" : "c";

  const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    location
  )}&count=1&language=en&format=json`;
  const geocode = await fetchJson(geocodeUrl, {
    headers: {
      accept: "application/json",
      "user-agent": "maple-hackathon-toolhub/1.0",
    },
  });
  const result = Array.isArray(geocode.results) ? geocode.results[0] : undefined;
  if (!result) {
    throw new Error(`No geocoding results for location "${location}".`);
  }

  const latitude = asNumber(result.latitude);
  const longitude = asNumber(result.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(`Invalid coordinates for location "${location}".`);
  }

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min&forecast_days=${days}` +
    `&timezone=auto&temperature_unit=${unit === "f" ? "fahrenheit" : "celsius"}`;
  const forecast = await fetchJson(forecastUrl, {
    headers: {
      accept: "application/json",
      "user-agent": "maple-hackathon-toolhub/1.0",
    },
  });

  const daily = asObject(forecast.daily);
  const dates = Array.isArray(daily.time) ? daily.time : [];
  const maxTemps = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
  const minTemps = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];
  const weatherCodes = Array.isArray(daily.weathercode) ? daily.weathercode : [];
  const entries = [];
  for (let i = 0; i < dates.length; i += 1) {
    const date = asString(dates[i]);
    if (!date) {
      continue;
    }
    const code = asNumber(weatherCodes[i]) ?? -1;
    entries.push({
      date,
      weatherCode: code,
      summary: weatherCodeLabel(code),
      tempMin: asNumber(minTemps[i]),
      tempMax: asNumber(maxTemps[i]),
      unit: unit === "f" ? "F" : "C",
    });
  }

  const place = [asString(result.name), asString(result.country), asString(result.admin1)]
    .filter((value) => value && value.length > 0)
    .join(", ");
  const text = [
    `Forecast for ${place || location}`,
    ...entries.map(
      (entry) =>
        `${entry.date}: ${entry.summary}, low ${entry.tempMin ?? "?"}${entry.unit}, high ${entry.tempMax ?? "?"}${entry.unit}`
    ),
  ].join("\n");
  return okToolResult(
    "weather_forecast",
    {
      location: place || location,
      latitude,
      longitude,
      days: entries,
    },
    text
  );
}

async function runSlackPostMessage(argumentsInput) {
  const args = asObject(argumentsInput);
  const text = asString(args.text);
  if (!text) {
    throw new Error("text is required.");
  }
  const channel = asString(args.channel);
  const threadTs = asString(args.threadTs);
  const unfurlLinks = args.unfurlLinks === true;

  const webhookUrl = asString(process.env.SLACK_WEBHOOK_URL);
  if (webhookUrl) {
    const payload = {
      text,
      ...(channel ? { channel } : {}),
      ...(threadTs ? { thread_ts: threadTs } : {}),
    };
    const response = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "user-agent": "maple-hackathon-toolhub/1.0",
      },
      body: JSON.stringify(payload),
    });
    const raw = (await response.text()).trim();
    if (!response.ok || (raw.length > 0 && raw !== "ok")) {
      throw new Error(`Slack webhook error: ${response.status} ${raw || "unknown"}`);
    }
    return okToolResult(
      "slack_post_message",
      {
        mode: "incoming_webhook",
        channel: channel ?? null,
        threadTs: threadTs ?? null,
        ok: true,
      },
      `Slack message sent via webhook${channel ? ` to ${channel}` : ""}.`
    );
  }

  const botToken = asString(process.env.SLACK_BOT_TOKEN);
  if (!botToken) {
    throw new Error(
      "Slack is not configured. Set SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN (and optionally SLACK_DEFAULT_CHANNEL)."
    );
  }
  const resolvedChannel = channel ?? asString(process.env.SLACK_DEFAULT_CHANNEL);
  if (!resolvedChannel) {
    throw new Error("channel is required when using SLACK_BOT_TOKEN.");
  }

  const response = await fetchWithTimeout("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${botToken}`,
      "user-agent": "maple-hackathon-toolhub/1.0",
    },
    body: JSON.stringify({
      channel: resolvedChannel,
      text,
      unfurl_links: unfurlLinks,
      unfurl_media: unfurlLinks,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Slack API HTTP ${response.status}.`);
  }
  if (payload.ok !== true) {
    throw new Error(`Slack API error: ${asString(payload.error) ?? "unknown_error"}.`);
  }

  return okToolResult(
    "slack_post_message",
    {
      mode: "bot_token",
      ok: true,
      channel: asString(payload.channel) ?? resolvedChannel,
      threadTs: asString(payload.ts) ?? null,
    },
    `Slack message sent to ${asString(payload.channel) ?? resolvedChannel}.`
  );
}

async function runHnSearch(argumentsInput) {
  const args = asObject(argumentsInput);
  const query = asString(args.query);
  if (!query) {
    throw new Error("query is required.");
  }
  const maxResults = clamp(Math.trunc(asNumber(args.maxResults) ?? 5), 1, 20);
  const tagsRaw = (asString(args.tags) ?? "story").toLowerCase();
  const tags =
    tagsRaw === "all" ||
    tagsRaw === "comment" ||
    tagsRaw === "ask_hn" ||
    tagsRaw === "show_hn" ||
    tagsRaw === "job"
      ? tagsRaw
      : "story";

  let endpoint = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(
    query
  )}&hitsPerPage=${maxResults}`;
  if (tags !== "all") {
    endpoint += `&tags=${encodeURIComponent(tags)}`;
  }

  const payload = await fetchJson(endpoint, {
    headers: {
      accept: "application/json",
      "user-agent": "maple-hackathon-toolhub/1.0",
    },
  });

  const hits = Array.isArray(payload.hits) ? payload.hits : [];
  const results = hits.slice(0, maxResults).map((hit) => {
    const item = asObject(hit);
    const objectId = asString(item.objectID) ?? "";
    const fallbackUrl = objectId ? `https://news.ycombinator.com/item?id=${objectId}` : "";
    const title = asString(item.title) ?? asString(item.story_title) ?? `HN item ${objectId || "unknown"}`;
    const url = asString(item.url) ?? asString(item.story_url) ?? fallbackUrl;
    return {
      title,
      url,
      author: asString(item.author) ?? "",
      points: asNumber(item.points) ?? 0,
      comments: asNumber(item.num_comments) ?? 0,
      createdAt: asString(item.created_at) ?? "",
    };
  });

  const text = results.length
    ? results
        .map(
          (entry, index) =>
            `${index + 1}. ${entry.title}\n${entry.url}\nby ${entry.author || "unknown"} | points ${entry.points} | comments ${entry.comments}`
        )
        .join("\n\n")
    : `No Hacker News results found for "${query}".`;

  return okToolResult("hn_search", { query, tags, count: results.length, results }, text);
}

async function runArxivSearch(argumentsInput) {
  const args = asObject(argumentsInput);
  const query = asString(args.query);
  if (!query) {
    throw new Error("query is required.");
  }
  const maxResults = clamp(Math.trunc(asNumber(args.maxResults) ?? 5), 1, 10);
  const sortByRaw = asString(args.sortBy) ?? "relevance";
  const sortBy =
    sortByRaw === "lastUpdatedDate" || sortByRaw === "submittedDate" ? sortByRaw : "relevance";

  const endpoint =
    `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}` +
    `&start=0&max_results=${maxResults}&sortBy=${encodeURIComponent(sortBy)}&sortOrder=descending`;
  const response = await fetchWithTimeout(endpoint, {
    headers: {
      accept: "application/atom+xml,text/xml;q=0.9,*/*;q=0.8",
      "user-agent": "maple-hackathon-toolhub/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from arXiv.`);
  }
  const xml = await response.text();
  const entries = xml
    .split("<entry>")
    .slice(1)
    .map((chunk) => chunk.split("</entry>")[0]);

  const results = [];
  for (const entry of entries) {
    const title = extractXmlTag(entry, "title");
    if (!title) {
      continue;
    }
    const summary = extractXmlTag(entry, "summary");
    const id = extractXmlTag(entry, "id");
    const updated = extractXmlTag(entry, "updated");
    const published = extractXmlTag(entry, "published");
    const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/gi)]
      .map((match) => normalizeWhitespace(match[1]))
      .filter((value) => value.length > 0);
    const pdfMatch = entry.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/i);
    const pdfUrl = pdfMatch ? normalizeWhitespace(pdfMatch[1]) : "";
    results.push({
      title,
      authors,
      summary,
      url: id,
      pdfUrl,
      published,
      updated,
    });
    if (results.length >= maxResults) {
      break;
    }
  }

  const text = results.length
    ? results
        .map(
          (entry, index) =>
            `${index + 1}. ${entry.title}\n` +
            `Authors: ${entry.authors.join(", ") || "unknown"}\n` +
            `Published: ${entry.published || "unknown"}\n` +
            `URL: ${entry.url}\n` +
            `${truncate(entry.summary, 320)}`
        )
        .join("\n\n")
    : `No arXiv results found for "${query}".`;

  return okToolResult("arxiv_search", { query, sortBy, count: results.length, results }, text);
}

async function runOpenLibrarySearch(argumentsInput) {
  const args = asObject(argumentsInput);
  const query = asString(args.query);
  if (!query) {
    throw new Error("query is required.");
  }
  const maxResults = clamp(Math.trunc(asNumber(args.maxResults) ?? 5), 1, 10);
  let source = "openlibrary";
  let results = [];

  try {
    const endpoint = `https://openlibrary.org/search.json?q=${encodeURIComponent(
      query
    )}&limit=${maxResults}`;
    const payload = await fetchJson(endpoint, {
      headers: {
        accept: "application/json",
        "user-agent": "maple-hackathon-toolhub/1.0",
      },
    });
    const docs = Array.isArray(payload.docs) ? payload.docs : [];
    results = docs.slice(0, maxResults).map((doc) => {
      const item = asObject(doc);
      const key = asString(item.key) ?? "";
      return {
        title: asString(item.title) ?? "Untitled",
        authors: Array.isArray(item.author_name)
          ? item.author_name.map((name) => asString(name)).filter((name) => Boolean(name))
          : [],
        firstPublishYear: asNumber(item.first_publish_year) ?? null,
        editionCount: asNumber(item.edition_count) ?? 0,
        url: key ? `https://openlibrary.org${key}` : "",
      };
    });
  } catch {
    source = "google_books_fallback";
    const fallbackEndpoint = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
      query
    )}&maxResults=${maxResults}&printType=books`;
    const payload = await fetchJson(fallbackEndpoint, {
      headers: {
        accept: "application/json",
        "user-agent": "maple-hackathon-toolhub/1.0",
      },
    });
    const items = Array.isArray(payload.items) ? payload.items : [];
    results = items.slice(0, maxResults).map((entry) => {
      const item = asObject(asObject(entry).volumeInfo);
      return {
        title: asString(item.title) ?? "Untitled",
        authors: Array.isArray(item.authors)
          ? item.authors.map((name) => asString(name)).filter((name) => Boolean(name))
          : [],
        firstPublishYear: asString(item.publishedDate) ?? null,
        editionCount: null,
        url: asString(item.infoLink) ?? "",
      };
    });
  }

  const text = results.length
    ? results
        .map(
          (entry, index) =>
            `${index + 1}. ${entry.title}\n` +
            `Author(s): ${entry.authors.join(", ") || "unknown"}\n` +
            `First published: ${entry.firstPublishYear ?? "unknown"} | Editions: ${entry.editionCount}\n` +
            `${entry.url}`
        )
        .join("\n\n")
    : `No OpenLibrary results found for "${query}".`;
  return okToolResult("openlibrary_search", { query, source, count: results.length, results }, text);
}

async function runTool(name, argumentsInput) {
  if (name === "web_search") {
    return runWebSearch(argumentsInput);
  }
  if (name === "web_fetch") {
    return runWebFetch(argumentsInput);
  }
  if (name === "wikipedia_summary") {
    return runWikipediaSummary(argumentsInput);
  }
  if (name === "github_repo_info") {
    return runGithubRepoInfo(argumentsInput);
  }
  if (name === "weather_forecast") {
    return runWeatherForecast(argumentsInput);
  }
  if (name === "slack_post_message") {
    return runSlackPostMessage(argumentsInput);
  }
  if (name === "hn_search") {
    return runHnSearch(argumentsInput);
  }
  if (name === "arxiv_search") {
    return runArxivSearch(argumentsInput);
  }
  if (name === "openlibrary_search") {
    return runOpenLibrarySearch(argumentsInput);
  }
  throw new Error(`Unknown tool "${name}".`);
}

function toJsonRpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function toJsonRpcResult(id, result) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  };
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error("Request body too large.");
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) {
    return {};
  }
  let value = Buffer.concat(chunks).toString("utf8");

  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof value === "string") {
      value = JSON.parse(value);
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (value.type === "Buffer" && Array.isArray(value.data)) {
        value = Buffer.from(value.data).toString("utf8");
        continue;
      }
      if ("body" in value) {
        value = value.body;
        continue;
      }
      if ("payload" in value) {
        value = value.payload;
        continue;
      }
    }

    break;
  }

  return value;
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  if (req.method !== "POST" || (requestUrl.pathname !== "/" && requestUrl.pathname !== "/mcp")) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    console.warn("[toolhub] invalid request body", error instanceof Error ? error.message : String(error));
    sendJson(res, 400, toJsonRpcError(null, -32700, "Invalid JSON request body.", String(error)));
    return;
  }

  const payload = asObject(body);
  const id = payload.id ?? null;
  const method = asString(payload.method);
  const params = asObject(payload.params);

  if (!method) {
    console.warn("[toolhub] missing jsonrpc method", JSON.stringify(payload));
    sendJson(res, 400, toJsonRpcError(id, -32600, "Invalid JSON-RPC request."));
    return;
  }

  try {
    if (method === "tools/list") {
      sendJson(res, 200, toJsonRpcResult(id, { tools: TOOL_DEFINITIONS }));
      return;
    }

    if (method === "tools/call") {
      const name = asString(params.name);
      if (!name) {
        sendJson(res, 400, toJsonRpcError(id, -32602, "tools/call requires params.name."));
        return;
      }
      const args = asObject(params.arguments);
      const result = await runTool(name, args);
      sendJson(res, 200, toJsonRpcResult(id, result));
      return;
    }

    if (method === "ping") {
      sendJson(res, 200, toJsonRpcResult(id, { ok: true, service: "maple-hackathon-toolhub" }));
      return;
    }

    sendJson(res, 404, toJsonRpcError(id, -32601, `Method "${method}" not found.`));
  } catch (error) {
    sendJson(
      res,
      500,
      toJsonRpcError(
        id,
        -32000,
        error instanceof Error ? error.message : "Tool execution failed."
      )
    );
  }
});

const TOOLHUB_HOST = process.env.HACKATHON_TOOLHUB_HOST || "127.0.0.1";

server.listen(TOOLHUB_PORT, TOOLHUB_HOST, () => {
  console.log(`[toolhub] listening on http://${TOOLHUB_HOST}:${TOOLHUB_PORT}/mcp`);
  console.log(`[toolhub] tools=${TOOL_DEFINITIONS.map((tool) => tool.name).join(",")}`);
});
