import { downstreamToolsCacheTtlMs } from "../config.js";
import {
  listToolsFromDownstream,
  type DownstreamAppConfig,
} from "./downstream-proxy.js";

type DownstreamToolsListResult = Awaited<ReturnType<typeof listToolsFromDownstream>>;

const downstreamToolsCache = new Map<
  string,
  {
    expiresAt: number;
    value: DownstreamToolsListResult;
  }
>();
const downstreamToolsInFlight = new Map<string, Promise<DownstreamToolsListResult>>();

export function clearDownstreamToolsCache(appId?: string): void {
  if (appId) {
    downstreamToolsCache.delete(appId);
    downstreamToolsInFlight.delete(appId);
    return;
  }
  downstreamToolsCache.clear();
  downstreamToolsInFlight.clear();
}

function getCachedDownstreamTools(appId: string): DownstreamToolsListResult | undefined {
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

function setCachedDownstreamTools(appId: string, value: DownstreamToolsListResult): void {
  downstreamToolsCache.set(appId, {
    expiresAt: Date.now() + downstreamToolsCacheTtlMs,
    value,
  });
}

export async function listToolsFromDownstreamCached(
  app: DownstreamAppConfig,
  options: { forceRefresh?: boolean } = {},
): Promise<DownstreamToolsListResult> {
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
