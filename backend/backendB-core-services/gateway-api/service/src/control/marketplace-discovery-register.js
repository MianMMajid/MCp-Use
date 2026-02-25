import { asString, buildUrlWithQueryParams, withAbortTimeout, } from "../helpers.js";
import { downstreamAppRegistry, smitheryApiBaseUrl, smitheryApiKey, smitheryTimeoutMs, mcpSoBaseUrl, mcpSoTimeoutMs, } from "../config.js";
import { clearDownstreamToolsCache, normalizeDynamicMcpUrl, } from "./downstream-resolution.js";
import { parseMcpSoSlug, } from "./marketplace-provider.js";
import { fetchSmitheryServerDetails, resolveSmitheryDeploymentUrl, toSmitheryDownstreamAppId, } from "../integrations/smithery.js";
import { resolveMcpSoDeploymentUrl, resolveMcpSoServerDetails, toMcpSoDownstreamAppId, } from "../integrations/mcpso.js";
async function resolveMarketplaceServer(options) {
    if (options.provider === "smithery") {
        const detail = await withAbortTimeout(smitheryTimeoutMs, (signal) => fetchSmitheryServerDetails(options.id, {
            apiBaseUrl: smitheryApiBaseUrl,
            apiKey: smitheryApiKey,
            signal,
        }));
        const deploymentUrl = resolveSmitheryDeploymentUrl(detail);
        const allowlist = Array.isArray(detail.tools)
            ? detail.tools
                .map((tool) => asString(tool.name))
                .filter((name) => Boolean(name))
            : [];
        return {
            provider: "smithery",
            id: detail.qualifiedName,
            title: detail.displayName ?? detail.qualifiedName,
            description: detail.description,
            sourceUrl: `https://smithery.ai/server/${encodeURIComponent(detail.qualifiedName)}`,
            appIdSuggestion: toSmitheryDownstreamAppId(detail.qualifiedName),
            mcpUrl: deploymentUrl,
            defaultToolAllowlist: allowlist,
        };
    }
    const parsed = parseMcpSoSlug(options.id);
    const detail = await withAbortTimeout(mcpSoTimeoutMs, (signal) => resolveMcpSoServerDetails({
        baseUrl: mcpSoBaseUrl,
        signal,
        slug: parsed.slug,
        serverUrl: parsed.serverUrl,
    }));
    return {
        provider: "mcpso",
        id: detail.slug || detail.id,
        title: detail.title,
        description: detail.description,
        sourceUrl: detail.pageUrl,
        appIdSuggestion: toMcpSoDownstreamAppId(detail.slug),
        mcpUrl: resolveMcpSoDeploymentUrl({
            sse_url: detail.sseUrl,
            server_config: detail.serverConfig,
            server_command: detail.serverCommand,
            url: detail.sourceUrl,
        }),
    };
}
export async function registerMarketplaceDownstream(options) {
    const preResolvedMcpUrl = asString(options.resolvedMcpUrl);
    const resolved = preResolvedMcpUrl
        ? {
            provider: options.provider,
            id: options.id,
            title: options.resolvedTitle ?? options.name ?? options.id,
            description: options.resolvedDescription,
            sourceUrl: options.resolvedSourceUrl,
            appIdSuggestion: options.provider === "smithery"
                ? toSmitheryDownstreamAppId(options.id)
                : toMcpSoDownstreamAppId(options.id),
            mcpUrl: preResolvedMcpUrl,
        }
        : await resolveMarketplaceServer({
            provider: options.provider,
            id: options.id,
        });
    if (!resolved.mcpUrl) {
        throw new Error(`${resolved.provider} server "${resolved.id}" does not expose a public HTTP MCP endpoint.`);
    }
    const normalizedMcpUrl = normalizeDynamicMcpUrl(resolved.mcpUrl);
    const mcpUrl = buildUrlWithQueryParams(normalizedMcpUrl, options.query ?? {});
    const appId = options.appId ?? resolved.appIdSuggestion;
    const existing = downstreamAppRegistry.get(appId);
    if (existing && !options.overwrite) {
        throw new Error(`Downstream app "${appId}" already exists. Set overwrite=true to replace it.`);
    }
    const timeoutMs = options.timeoutMs
        ? Math.max(1_000, Math.min(60_000, Math.trunc(options.timeoutMs)))
        : 12_000;
    const authHeader = options.authHeader?.trim() || "authorization";
    const authScheme = options.authScheme === "raw" ? "raw" : "bearer";
    const allowlist = options.toolAllowlist && options.toolAllowlist.length > 0
        ? options.toolAllowlist
        : options.restrictToCatalogTools !== false &&
            resolved.defaultToolAllowlist &&
            resolved.defaultToolAllowlist.length > 0
            ? resolved.defaultToolAllowlist
            : undefined;
    const app = {
        id: appId,
        name: options.name ?? resolved.title,
        description: `[${resolved.provider}] ${resolved.id}${resolved.description ? ` - ${resolved.description}` : ""}`,
        mcpUrl,
        enabled: options.enabled ?? true,
        timeoutMs,
        apiKey: options.apiKey ?? (resolved.provider === "smithery" ? smitheryApiKey : undefined),
        authHeader,
        authScheme,
        headers: options.headers && Object.keys(options.headers).length > 0 ? options.headers : undefined,
        toolAllowlist: allowlist,
    };
    downstreamAppRegistry.set(appId, app);
    clearDownstreamToolsCache(appId);
    return {
        app,
        appId,
        provider: resolved.provider,
        resolved,
        replaced: Boolean(existing),
    };
}
//# sourceMappingURL=marketplace-discovery-register.js.map