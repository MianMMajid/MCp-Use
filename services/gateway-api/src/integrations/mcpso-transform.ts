import {
  asBoolean,
  asString,
  normalizeSlug,
} from "./mcpso-primitives.js";
import {
  normalizeMcpSoUrlCandidate,
  resolveMcpSoDeploymentUrl,
} from "./mcpso-deployment.js";
import type {
  McpSoSearchResult,
  McpSoServer,
  McpSoServerDetails,
} from "./mcpso-types.js";

function parseTags(value?: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function toSearchResult(baseUrl: string, project: McpSoServer): McpSoSearchResult | undefined {
  const uuid = asString(project.uuid);
  const name = asString(project.name);
  const title = asString(project.title);
  if (!title || !name) {
    return undefined;
  }
  const authorName = asString(project.author_name);
  const slug = normalizeSlug(name, authorName);
  if (!slug) {
    return undefined;
  }
  const root = new URL(baseUrl);
  const sourceUrl = new URL(`/server/${slug}`, root).toString();
  return {
    provider: "mcpso",
    id: uuid ?? slug,
    uuid,
    slug,
    title,
    description: asString(project.description),
    authorName,
    tags: parseTags(asString(project.tags)),
    sourceUrl,
    sseUrl: normalizeMcpSoUrlCandidate(project.sse_url),
    resolvedMcpUrl: resolveMcpSoDeploymentUrl(project),
    allowCall: asBoolean(project.allow_call),
    serverConfig: asString(project.server_config),
  };
}

export function toDetail(
  baseUrl: string,
  project: McpSoServer,
): McpSoServerDetails | undefined {
  const search = toSearchResult(baseUrl, project);
  if (!search) {
    return undefined;
  }
  return {
    ...search,
    serverCommand: asString(project.server_command),
    pageUrl: search.sourceUrl,
  };
}
