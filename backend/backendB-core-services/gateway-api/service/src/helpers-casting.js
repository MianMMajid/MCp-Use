export function asString(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
export function envValue(value) {
    const normalized = asString(value);
    if (!normalized) {
        return undefined;
    }
    if (normalized.length >= 2) {
        const first = normalized[0];
        const last = normalized[normalized.length - 1];
        if ((first === `"` && last === `"`) || (first === `'` && last === `'`)) {
            const unwrapped = normalized.slice(1, -1).trim();
            return unwrapped.length > 0 ? unwrapped : undefined;
        }
    }
    return normalized;
}
export function parseAppIdList(value) {
    const rawEntries = [];
    if (typeof value === "string") {
        rawEntries.push(...value.split(","));
    }
    else if (Array.isArray(value)) {
        for (const entry of value) {
            if (typeof entry === "string") {
                rawEntries.push(entry);
            }
        }
    }
    const unique = new Set();
    for (const entry of rawEntries) {
        const normalized = entry.trim();
        if (normalized.length > 0) {
            unique.add(normalized);
        }
    }
    return [...unique];
}
export function asNumber(value) {
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
export function asBoolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
}
export function asObject(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    return {};
}
export function asStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0);
}
export function asStringRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    const record = {};
    for (const [key, raw] of Object.entries(value)) {
        if (typeof raw !== "string") {
            continue;
        }
        const normalizedKey = key.trim();
        const normalizedValue = raw.trim();
        if (!normalizedKey || !normalizedValue) {
            continue;
        }
        record[normalizedKey] = normalizedValue;
    }
    return record;
}
export function dedupeBy(items, key) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const normalized = key(item);
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        out.push(item);
    }
    return out;
}
export function toFiniteNumber(value, fallback = 0) {
    const parsed = asNumber(value);
    return Number.isFinite(parsed) ? Number(parsed) : fallback;
}
//# sourceMappingURL=helpers-casting.js.map