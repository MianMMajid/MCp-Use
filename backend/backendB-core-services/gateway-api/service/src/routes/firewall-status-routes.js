import { server, database, getGrpcClients, buildRuntimeStatus } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString } from "../helpers.js";
import { buildFirewallChatContext, buildYcMetrics, } from "../trace-helpers.js";
import { buildYcAppBrief } from "../strategy/yc-narrative.js";
import { grpcUnary } from "../grpc-clients.js";
export function registerFirewallStatusRoutes() {
    // ── GET /api/yc/brief ──────────────────────────────────────────────────────
    server.get("/api/yc/brief", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const rawFocus = c.req.query("focus");
        const focus = rawFocus === "moat" || rawFocus === "traction" || rawFocus === "revenue" ? rawFocus : "full";
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
    // ── GET /api/firewall/rules/effective ────────────────────────────────────
    server.get("/api/firewall/rules/effective", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) {
            return unauthorized;
        }
        const grpcClients = getGrpcClients();
        if (!grpcClients?.contextWall) {
            return c.json({
                ok: false,
                source: "context-wall",
                error: "context-wall unavailable",
            }, 503);
        }
        try {
            const response = await grpcUnary(grpcClients.contextWall, "listPolicyRules", {});
            const rules = Array.isArray(response?.rules) ? response.rules : [];
            return c.json({
                ok: true,
                source: "context-wall",
                ruleCount: Number(response?.ruleCount ?? rules.length),
                rules,
            });
        }
        catch (error) {
            return c.json({
                ok: false,
                source: "context-wall",
                error: "context-wall policy fetch failed",
                warning: error instanceof Error ? error.message : String(error),
            }, 503);
        }
    });
}
//# sourceMappingURL=firewall-status-routes.js.map
