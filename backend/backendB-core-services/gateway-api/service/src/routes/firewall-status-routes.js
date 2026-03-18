import { server, database, getGrpcClients, buildRuntimeStatus } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { asString } from "../helpers.js";
import { buildFirewallChatContext, buildYcMetrics, } from "../trace-helpers.js";
import { buildYcAppBrief } from "../strategy/yc-narrative.js";
import { grpcUnary } from "../grpc-clients.js";
import { mapleLog } from "../logging.js";
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
        const agentId = asString(c.req.query("agentId"));
        const env = asString(c.req.query("env"));
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
            let rules = Array.isArray(response?.rules) ? response.rules : [];
            // M1-17: Filter by agentId — wildcard scope rules always included
            if (agentId) {
                rules = rules.filter((rule) => {
                    const scope = rule.scope ?? rule.metadata?.scope;
                    if (!scope) return true; // global rules always apply
                    if (scope === "*") return true;
                    if (scope === agentId) return true;
                    return false;
                });
            }
            // M1-17: Filter by env — rules without metadata.env always included
            if (env) {
                rules = rules.filter((rule) => {
                    const ruleEnv = rule.metadata?.env;
                    if (!ruleEnv) return true; // no env restriction means global
                    return ruleEnv === env;
                });
            }
            // M1-17: Try to fetch tenant policy from database for enrichment
            let tenantPolicy = null;
            try {
                const authContext = (await import("../auth.js")).authContextStorage.getStore();
                const tenantId = authContext?.tenantId ?? "default";
                const orgId = authContext?.orgId ?? "default";
                const policyResult = await database.pool.query(
                    `SELECT * FROM gateway_modifier_tenant_policies WHERE tenant_id = $1 AND org_id = $2 AND is_active = TRUE LIMIT 1`,
                    [tenantId, orgId]
                );
                if (policyResult.rows.length > 0) {
                    const row = policyResult.rows[0];
                    tenantPolicy = {
                        tenantId: row.tenant_id,
                        orgId: row.org_id,
                        version: row.version,
                        policy: JSON.parse(row.policy_json || "{}"),
                        activatedAt: row.activated_at,
                    };
                }
            } catch {
                // Tenant policy lookup is optional enrichment
            }
            return c.json({
                ok: true,
                source: "context-wall",
                agentId: agentId || null,
                env: env || null,
                ruleCount: rules.length,
                rules,
                tenantPolicy,
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
