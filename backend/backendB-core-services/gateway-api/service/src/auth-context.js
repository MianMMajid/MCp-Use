import { AsyncLocalStorage } from "node:async_hooks";
import { dedupeBy } from "./helpers.js";
import { sessionOwnerScopeMode, primaryConfiguredApiKeyFingerprint, } from "./config.js";
export const authContextStorage = new AsyncLocalStorage();
export function resolveSessionOwnerFingerprint(userId) {
    const userScoped = `user:${userId}`;
    const primaryKeyScoped = primaryConfiguredApiKeyFingerprint;
    if (sessionOwnerScopeMode === "user") {
        return userScoped;
    }
    if (sessionOwnerScopeMode === "api_key_primary") {
        return primaryKeyScoped ?? userScoped;
    }
    return primaryKeyScoped ?? userScoped;
}
export function currentOwnerKeyFingerprintsForLookup() {
    const auth = authContextStorage.getStore();
    if (!auth || auth.authBypass) {
        return undefined;
    }
    if (auth.method === "session" && auth.userId) {
        const userScoped = `user:${auth.userId}`;
        const sessionScoped = resolveSessionOwnerFingerprint(auth.userId);
        const out = [sessionScoped];
        if (sessionScoped !== userScoped) {
            out.push(userScoped);
        }
        return dedupeBy(out, (entry) => entry);
    }
    if (auth.keyFingerprint) {
        return [auth.keyFingerprint];
    }
    return undefined;
}
export function currentOwnerKeyFingerprint() {
    const auth = authContextStorage.getStore();
    if (!auth || auth.authBypass) {
        return undefined;
    }
    if (auth.method === "session" && auth.userId) {
        return resolveSessionOwnerFingerprint(auth.userId);
    }
    return auth.keyFingerprint;
}
//# sourceMappingURL=auth-context.js.map