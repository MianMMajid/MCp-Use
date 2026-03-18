import { server, database, getGrpcClients } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { readJsonBody, asString } from "../helpers.js";
import { grpcUnary } from "../grpc-clients.js";
import { buildCandidateStep, evaluateFirewallStepViaGrpc } from "../trace-helpers.js";
import { mapleLog } from "../logging.js";
import { checkPermission } from "../middleware/rbac-middleware.js";

export function registerPolicyRoutes() {
    // GET /api/policies/effective — resolved effective policy for a specific agent/env context
    server.app.get("/api/policies/effective", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const denied = await checkPermission(c, "policy", "read");
        if (denied) return denied;

        const agentId = c.req.query("agentId") ?? "";
        const env = c.req.query("env") ?? "";

        const grpcClients = getGrpcClients();
        if (!grpcClients?.contextWall) {
            return c.json({ ok: false, error: "context-wall unavailable" }, 503);
        }

        try {
            const response = await grpcUnary(grpcClients.contextWall, "listPolicyRules", {});
            const allRules = Array.isArray(response?.rules) ? response.rules : [];

            // Filter rules relevant to the agent/env if specified
            let effectiveRules = allRules;
            if (agentId) {
                effectiveRules = allRules.filter((rule) => {
                    const scope = rule.scope ?? rule.metadata?.scope;
                    if (!scope) return true; // global rules always apply
                    if (scope === "*") return true;
                    if (scope === agentId) return true;
                    return false;
                });
            }

            // Also fetch tenant policy if available
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
                // Tenant policy lookup is optional
            }

            // M1-17: Deprecation headers — successor is /api/firewall/rules/effective
            c.header("Deprecation", "true");
            c.header("Link", '</api/firewall/rules/effective>; rel="successor-version"');
            return c.json({
                ok: true,
                agentId: agentId || null,
                env: env || null,
                ruleCount: effectiveRules.length,
                rules: effectiveRules,
                tenantPolicy,
            });
        } catch (err) {
            mapleLog("error", "policies.effective_failed", { error: err.message });
            return c.json({ ok: false, error: "Failed to fetch effective policies", details: err.message }, 503);
        }
    });

    // POST /api/policies/simulate — "If agent does X, would it be allowed?"
    server.app.post("/api/policies/simulate", async (c) => {
        const unauthorized = await requireApiKeyResponse(c, database);
        if (unauthorized) return unauthorized;

        const denied = await checkPermission(c, "policy", "simulate");
        if (denied) return denied;

        const body = await readJsonBody(c);
        const toolName = asString(body.tool) ?? asString(body.toolName) ?? "";
        const action = asString(body.action) ?? "tool_call";
        const target = asString(body.target) ?? "";

        if (!toolName && !action) {
            return c.json({ error: "tool or action is required for simulation" }, 400);
        }

        try {
            const candidateStep = buildCandidateStep(
                {
                    tool: toolName,
                    action,
                    target,
                    arguments: body.arguments ?? body.args ?? {},
                    command: body.command ?? {},
                },
                0,
                { actor: "agent", type: "tool_call" }
            );

            const decision = await evaluateFirewallStepViaGrpc(candidateStep);

            return c.json({
                ok: true,
                simulation: true,
                tool: toolName,
                action,
                target,
                decision: decision.action,
                allowed: !decision.shouldBlock,
                shouldBlock: decision.shouldBlock,
                severity: decision.severity,
                rule: decision.rule,
                message: decision.message,
                recommendation: decision.recommendation,
                evaluatedAt: decision.evaluatedAt,
            });
        } catch (err) {
            mapleLog("error", "policies.simulate_failed", { tool: toolName, error: err.message });
            return c.json({ error: "Simulation failed", details: err.message }, 500);
        }
    });
}
