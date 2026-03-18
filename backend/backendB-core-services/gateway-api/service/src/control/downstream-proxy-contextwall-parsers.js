import { asObject } from "./downstream-proxy-utils.js";
export function parseJsonFromUnknown(raw) {
    if (!raw) {
        return undefined;
    }
    try {
        const json = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf-8");
        return JSON.parse(json);
    }
    catch {
        return undefined;
    }
}
export function parseForwardPayload(raw) {
    const parsed = parseJsonFromUnknown(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
    }
    return asObject(parsed);
}

export function parseMediatedToolResult(raw) {
    const parsed = parseJsonFromUnknown(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { result: parsed, cyberReport: null };
    }
    const envelope = asObject(parsed.__mapleMediatedToolResult);
    if (Object.keys(envelope).length === 0) {
        return {
            result: parsed,
            cyberReport: null,
        };
    }
    return {
        result: envelope.result ?? {},
        cyberReport:
            envelope.cyberReport && typeof envelope.cyberReport === "object" && !Array.isArray(envelope.cyberReport)
                ? envelope.cyberReport
                : null,
    };
}
function parseToolInputSchema(rawSchema) {
    if (!rawSchema) {
        return undefined;
    }
    try {
        if (typeof rawSchema === "object" && !Array.isArray(rawSchema)) {
            return rawSchema;
        }
        const json = typeof rawSchema === "string" ? rawSchema : Buffer.from(rawSchema).toString("utf-8");
        return JSON.parse(json);
    }
    catch {
        return undefined;
    }
}
export function normalizeToolsListFromPayload(forwardPayload) {
    const result = asObject(forwardPayload.result);
    const upstreamTools = Array.isArray(result.tools) ? result.tools : [];
    return upstreamTools
        .map((tool) => {
        const raw = tool;
        const inputSchema = parseToolInputSchema(raw?.inputSchema ?? raw?.input_schema ?? raw?.schema ?? raw?.inputSchemaJson);
        return {
            name: String(raw?.name || ""),
            description: String(raw?.description || ""),
            ...(inputSchema ? { inputSchema } : {}),
        };
    })
        .filter((tool) => tool.name.length > 0);
}
//# sourceMappingURL=downstream-proxy-contextwall-parsers.js.map
