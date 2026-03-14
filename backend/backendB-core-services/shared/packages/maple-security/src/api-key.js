import { createHash, timingSafeEqual } from "node:crypto";
function normalize(value) {
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
        const first = trimmed[0];
        const last = trimmed[trimmed.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return trimmed.slice(1, -1).trim();
        }
    }
    return trimmed;
}
function secureEquals(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length)
        return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
}
export function loadApiKeysFromEnv(env = process.env) {
    const keys = new Set();
    const single = env.MAPLE_API_KEY;
    if (single)
        keys.add(normalize(single));
    const multiple = env.MAPLE_API_KEYS;
    if (multiple) {
        for (const candidate of multiple.split(",")) {
            const value = normalize(candidate);
            if (value.length > 0)
                keys.add(value);
        }
    }
    return [...keys].filter((key) => key.length > 0);
}
export function extractApiKeyFromHeaders(xApiKeyHeader, authorizationHeader) {
    const xApiKey = xApiKeyHeader ? normalize(xApiKeyHeader) : undefined;
    if (xApiKey)
        return xApiKey;
    const authorization = authorizationHeader ? normalize(authorizationHeader) : undefined;
    if (!authorization)
        return undefined;
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match)
        return undefined;
    const token = match[1] ? normalize(match[1]) : undefined;
    return token && token.length > 0 ? token : undefined;
}
export function verifyApiKey(configuredKeys, providedKey) {
    if (configuredKeys.length === 0)
        return { ok: false, reason: "misconfigured" };
    if (!providedKey)
        return { ok: false, reason: "missing_key" };
    let matched = false;
    for (const expected of configuredKeys) {
        if (secureEquals(expected, providedKey)) {
            matched = true;
        }
        // Do NOT break — continue through all keys for constant time
    }
    if (!matched)
        return { ok: false, reason: "invalid_key" };
    return {
        ok: true,
        keyFingerprint: createHash("sha256").update(providedKey).digest("hex").slice(0, 12),
    };
}
//# sourceMappingURL=api-key.js.map