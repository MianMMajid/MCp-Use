import {
  createTraceForCurrentOwner,
  getLatestTraceBySessionForCurrentOwner,
  getTraceForCurrentOwner,
} from "../trace-helpers.js";

import type { Trace } from "@maple/types";

export function resolveProxyTrace(options: {
  traceId?: string;
  sessionId?: string;
  appId: string;
}): Trace {
  const traceId = options.traceId ? options.traceId.trim() : "";
  const sessionId = options.sessionId ? options.sessionId.trim() : "";

  if (traceId) {
    const existing = getTraceForCurrentOwner(traceId);
    if (!existing) {
      throw new Error(`Trace ${traceId} not found.`);
    }
    return existing;
  }

  if (sessionId) {
    const existing = getLatestTraceBySessionForCurrentOwner(sessionId);
    if (existing) {
      return existing;
    }
  }

  const nextSessionId = sessionId || `proxy-${Date.now().toString(36)}`;
  return createTraceForCurrentOwner({
    sessionId: nextSessionId,
    source: "manual",
    status: "active",
    metadata: {
      mode: "maple-downstream-proxy",
      downstreamAppId: options.appId,
      createdFromProxy: true,
    },
    steps: [],
  });
}
