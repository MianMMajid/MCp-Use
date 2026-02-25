import { downstreamToolsCacheTtlMs } from "../config.js";
import { listToolsFromDownstream, } from "./downstream-proxy.js";
const downstreamToolsCache = new Map();
const downstreamToolsInFlight = new Map();
export function clearDownstreamToolsCache(appId) {
    if (appId) {
        downstreamToolsCache.delete(appId);
        downstreamToolsInFlight.delete(appId);
        return;
    }
    downstreamToolsCache.clear();
    downstreamToolsInFlight.clear();
}
function getCachedDownstreamTools(appId) {
    const cached = downstreamToolsCache.get(appId);
    if (!cached) {
        return undefined;
    }
    if (Date.now() >= cached.expiresAt) {
        downstreamToolsCache.delete(appId);
        return undefined;
    }
    return cached.value;
}
function setCachedDownstreamTools(appId, value) {
    downstreamToolsCache.set(appId, {
        expiresAt: Date.now() + downstreamToolsCacheTtlMs,
        value,
    });
}
export async function listToolsFromDownstreamCached(app, options = {}) {
    if (!options.forceRefresh) {
        const cached = getCachedDownstreamTools(app.id);
        if (cached) {
            return cached;
        }
        const inFlight = downstreamToolsInFlight.get(app.id);
        if (inFlight) {
            return inFlight;
        }
    }
    const task = listToolsFromDownstream(app)
        .then((listed) => {
        setCachedDownstreamTools(app.id, listed);
        return listed;
    })
        .finally(() => {
        downstreamToolsInFlight.delete(app.id);
    });
    downstreamToolsInFlight.set(app.id, task);
    return task;
}
//# sourceMappingURL=downstream-resolution-cache.js.map