export function truncateText(value, maxLength = 2400) {
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, maxLength - 3)}...`;
}
export function compactUnknown(value, maxChars = 24_000) {
    try {
        const json = JSON.stringify(value);
        if (!json) {
            return value;
        }
        if (json.length <= maxChars) {
            return value;
        }
        return {
            truncated: true,
            preview: `${json.slice(0, maxChars - 3)}...`,
            originalBytes: Buffer.byteLength(json, "utf8"),
        };
    }
    catch {
        const fallback = String(value ?? "");
        return {
            truncated: true,
            preview: truncateText(fallback, Math.min(maxChars, 3000)),
        };
    }
}
export function summarizeJsonRpcPayload(payload, maxLength = 2400) {
    try {
        const json = JSON.stringify(payload);
        if (!json) {
            return "";
        }
        return truncateText(json, maxLength);
    }
    catch {
        return truncateText(String(payload ?? ""), maxLength);
    }
}
export function extractLikelyCommand(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    const fenced = trimmed.match(/```(?:bash|sh|zsh|shell)?\n([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
        const line = fenced[1]
            .split(/\r?\n/)
            .map((entry) => entry.trim())
            .find((entry) => entry.length > 0);
        if (line) {
            return line;
        }
    }
    return trimmed
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find((entry) => /^(curl|wget|bash|zsh|sh|python|node|npm|pnpm|yarn|pip|git|rm|chmod|scp|ssh)\b/i.test(entry));
}
export function sanitizeSessionId(value) {
    const normalized = value.replace(/[^a-zA-Z0-9._:-]/g, "-").replace(/-+/g, "-").slice(0, 96);
    return normalized.length > 0 ? normalized : `fork-${Date.now().toString(36)}`;
}
//# sourceMappingURL=helpers-text.js.map