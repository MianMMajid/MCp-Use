import { server, database, buildRuntimeStatus } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString } from "../helpers.js";
import {
  buildFirewallChatContext,
  buildYcMetrics,
} from "../trace-helpers.js";
import { buildYcAppBrief, type YcBriefFocus } from "../strategy/yc-narrative.js";

export function registerFirewallStatusRoutes() {
  // ── GET /api/yc/brief ──────────────────────────────────────────────────────
  server.get("/api/yc/brief", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }

    const rawFocus = c.req.query("focus");
    const focus: YcBriefFocus =
      rawFocus === "moat" || rawFocus === "traction" || rawFocus === "revenue" ? rawFocus : "full";

    const metrics = buildYcMetrics();
    return c.json({
      generatedAt: new Date().toISOString(),
      metrics,
      brief: buildYcAppBrief(metrics, focus),
    });
  });

  // ── GET /api/runtime/status ────────────────────────────────────────────────
  server.get("/api/runtime/status", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }

    return c.json({
      ok: true,
      status: buildRuntimeStatus(),
    });
  });

  // ── GET /api/firewall/state ────────────────────────────────────────────────
  server.get("/api/firewall/state", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }

    const traceId = asString(c.req.query("traceId"));
    const sessionId = asString(c.req.query("sessionId"));
    const context = buildFirewallChatContext({ traceId, sessionId });
    return c.json({
      ok: true,
      traceFound: Boolean(context.trace),
      context,
    });
  });
}
