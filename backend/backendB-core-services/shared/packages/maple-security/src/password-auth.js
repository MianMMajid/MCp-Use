import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
const DEFAULT_KEYLEN = 64;
export function hashPassword(password) {
    const normalized = password.trim();
    if (!normalized)
        throw new Error("Password is required.");
    const salt = randomBytes(16).toString("hex");
    const derived = scryptSync(normalized, salt, DEFAULT_KEYLEN).toString("hex");
    return `scrypt:${salt}:${derived}`;
}
export function verifyPassword(password, storedHash) {
    const normalized = password.trim();
    if (!normalized || !storedHash)
        return false;
    const [scheme, salt, hashHex] = storedHash.split(":");
    if (scheme !== "scrypt" || !salt || !hashHex)
        return false;
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(normalized, salt, expected.length);
    if (actual.length !== expected.length)
        return false;
    return timingSafeEqual(actual, expected);
}
//# sourceMappingURL=password-auth.js.map