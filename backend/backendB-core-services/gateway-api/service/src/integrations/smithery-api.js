import { asBoolean, asNumber, asObject, asString, buildRequestHeaders, candidateQualifiedNames, normalizeApiBaseUrl, } from "./smithery-utils.js";
async function fetchSmitheryJson(path, options = {}) {
    const baseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
    const url = new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    const query = options.query ?? {};
    for (const [key, value] of Object.entries(query)) {
        const trimmed = asString(value);
        if (!trimmed) {
            continue;
        }
        url.searchParams.set(key, trimmed);
    }
    const response = await fetch(url, {
        method: "GET",
        headers: buildRequestHeaders(options.apiKey),
        signal: options.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = payload && typeof payload === "object" ? JSON.stringify(payload) : String(payload ?? "");
        throw new Error(`Smithery API request failed (${response.status}): ${detail}`);
    }
    return payload;
}
export async function listSmitheryServers(options = {}) {
    const page = options.page && Number.isFinite(options.page) ? Math.max(1, Math.trunc(options.page)) : 1;
    const pageSizeRaw = options.pageSize && Number.isFinite(options.pageSize)
        ? Math.trunc(options.pageSize)
        : 20;
    const pageSize = Math.max(1, Math.min(100, pageSizeRaw));
    const payload = await fetchSmitheryJson("/servers", {
        apiBaseUrl: options.apiBaseUrl,
        apiKey: options.apiKey,
        signal: options.signal,
        query: {
            page: String(page),
            pageSize: String(pageSize),
            ...(options.query ? { q: options.query } : {}),
            ...(typeof options.remote === "boolean" ? { remote: String(options.remote) } : {}),
            ...(typeof options.deployed === "boolean" ? { deployed: String(options.deployed) } : {}),
            ...(typeof options.verified === "boolean" ? { verified: String(options.verified) } : {}),
        },
    });
    const root = asObject(payload);
    const rawServers = Array.isArray(root.servers) ? root.servers : [];
    const servers = rawServers
        .map((entry) => asObject(entry))
        .map((entry) => ({
        id: asString(entry.id) ?? "",
        qualifiedName: asString(entry.qualifiedName) ?? "",
        namespace: asString(entry.namespace),
        slug: asString(entry.slug),
        displayName: asString(entry.displayName),
        description: asString(entry.description),
        iconUrl: asString(entry.iconUrl),
        verified: asBoolean(entry.verified),
        useCount: asNumber(entry.useCount),
        remote: asBoolean(entry.remote),
        isDeployed: asBoolean(entry.isDeployed),
        createdAt: asString(entry.createdAt),
        homepage: asString(entry.homepage),
    }))
        .filter((server) => server.qualifiedName.length > 0);
    const pagination = asObject(root.pagination);
    return {
        servers,
        pagination: {
            currentPage: asNumber(pagination.currentPage),
            pageSize: asNumber(pagination.pageSize),
            totalPages: asNumber(pagination.totalPages),
            totalCount: asNumber(pagination.totalCount),
        },
    };
}
export async function fetchSmitheryServerDetails(qualifiedName, options = {}) {
    const candidates = candidateQualifiedNames(qualifiedName);
    if (candidates.length === 0) {
        throw new Error("qualifiedName is required.");
    }
    let lastError;
    for (const candidate of candidates) {
        try {
            const payload = await fetchSmitheryJson(`/servers/${encodeURIComponent(candidate)}`, {
                apiBaseUrl: options.apiBaseUrl,
                apiKey: options.apiKey,
                signal: options.signal,
            });
            const root = asObject(payload);
            const toolsRaw = Array.isArray(root.tools) ? root.tools : [];
            const tools = toolsRaw
                .map((entry) => asObject(entry))
                .map((tool) => ({
                name: asString(tool.name) ?? "",
                description: asString(tool.description),
                inputSchema: tool.inputSchema,
            }))
                .filter((tool) => tool.name.length > 0);
            const connectionsRaw = Array.isArray(root.connections) ? root.connections : [];
            const connections = connectionsRaw
                .map((entry) => asObject(entry))
                .map((connection) => ({
                type: asString(connection.type),
                deploymentUrl: asString(connection.deploymentUrl),
                configSchema: connection.configSchema,
            }));
            const resolvedQualifiedName = asString(root.qualifiedName) ?? candidate;
            return {
                qualifiedName: resolvedQualifiedName,
                displayName: asString(root.displayName),
                description: asString(root.description),
                iconUrl: asString(root.iconUrl),
                remote: asBoolean(root.remote),
                deploymentUrl: asString(root.deploymentUrl),
                connections,
                security: root.security,
                tools,
            };
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error ?? "Unknown error"));
        }
    }
    throw lastError ?? new Error(`Unable to resolve Smithery server "${qualifiedName}".`);
}
//# sourceMappingURL=smithery-api.js.map