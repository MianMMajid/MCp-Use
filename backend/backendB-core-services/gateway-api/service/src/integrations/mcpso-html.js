import { asNumber, asObject, asString, normalizeSlug, } from "./mcpso-utils.js";
function dedupeBy(items, key) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const id = key(item);
        if (!id || seen.has(id)) {
            continue;
        }
        seen.add(id);
        out.push(item);
    }
    return out;
}
function decodeNextFlightPayload(html) {
    const regex = /self\.__next_f\.push\(\[\s*\d+\s*,\s*"([\s\S]*?)"\s*\]\)/g;
    let decoded = "";
    for (const match of html.matchAll(regex)) {
        const raw = match[1];
        if (!raw) {
            continue;
        }
        try {
            decoded += JSON.parse(`"${raw}"`);
        }
        catch {
            continue;
        }
    }
    return decoded;
}
function extractJsonObjects(source, shouldInclude) {
    const collectMatches = (root) => {
        const out = [];
        const stack = [root];
        while (stack.length > 0) {
            const node = stack.pop();
            if (!node || typeof node !== "object") {
                continue;
            }
            if (Array.isArray(node)) {
                for (const item of node) {
                    stack.push(item);
                }
                continue;
            }
            const record = node;
            if (shouldInclude(record)) {
                out.push(record);
            }
            for (const value of Object.values(record)) {
                if (value && typeof value === "object") {
                    stack.push(value);
                }
            }
        }
        return out;
    };
    const found = [];
    for (let i = 0; i < source.length; i += 1) {
        if (source[i] !== "{") {
            continue;
        }
        let depth = 0;
        let inString = false;
        let escaped = false;
        let end = -1;
        for (let j = i; j < source.length; j += 1) {
            const ch = source[j];
            if (inString) {
                if (escaped) {
                    escaped = false;
                }
                else if (ch === "\\") {
                    escaped = true;
                }
                else if (ch === "\"") {
                    inString = false;
                }
                continue;
            }
            if (ch === "\"") {
                inString = true;
                continue;
            }
            if (ch === "{") {
                depth += 1;
                continue;
            }
            if (ch === "}") {
                depth -= 1;
                if (depth === 0) {
                    end = j;
                    break;
                }
            }
        }
        if (end <= i) {
            continue;
        }
        const candidate = source.slice(i, end + 1);
        try {
            const parsed = JSON.parse(candidate);
            found.push(...collectMatches(parsed));
        }
        catch {
            continue;
        }
        i = end;
    }
    return found;
}
function isLikelyMcpSoServerRecord(value) {
    const obj = asObject(value);
    const name = asString(obj.name);
    const title = asString(obj.title);
    if (!name || !title) {
        return false;
    }
    const type = asString(obj.type)?.toLowerCase();
    if (type && type !== "server") {
        return false;
    }
    const hasServerSignals = Boolean(asString(obj.author_name)) ||
        Boolean(asString(obj.uuid)) ||
        Boolean(asString(obj.url)) ||
        Boolean(asString(obj.tags)) ||
        Boolean(asString(obj.server_config)) ||
        Boolean(asString(obj.server_command)) ||
        asNumber(obj.id) !== undefined;
    return hasServerSignals;
}
export function parseServerObjectsFromHtml(html) {
    const decoded = decodeNextFlightPayload(html);
    const candidates = [...[decoded, html]]
        .filter((entry) => entry.length > 0)
        .flatMap((entry) => extractJsonObjects(entry, (value) => {
        return isLikelyMcpSoServerRecord(value);
    }));
    return dedupeBy(candidates, (item) => asString(item.uuid) ?? normalizeSlug(item.name, item.author_name));
}
//# sourceMappingURL=mcpso-html.js.map