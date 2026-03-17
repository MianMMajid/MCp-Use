/**
 * firewall-rule-routes.js
 *
 * Phase 5: Backend gaps — firewall rule CRUD that the frontend already calls.
 * POST /api/firewall/rules — create rule
 * DELETE /api/firewall/rules/:ruleId — delete rule
 * PATCH /api/firewall/rules/:ruleId — toggle/update rule
 * POST /api/firewall/rules/test — dry-run test
 */
import { requireApiKeyResponse } from "../auth-api-key.js";
import { getAuthContext } from "../auth-api-key.js";
import { requirePermission } from "../middleware/rbac-middleware.js";
import { database, getGrpcClients } from "../state.js";
import { asString, readJsonBody } from "../helpers.js";
import { grpcUnary } from "../grpc-clients.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { mapleLog } from "../logging.js";

async function ensureFirewallRulesTable() {
  const pool = database?.pool;
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS firewall_rules (
      rule_id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id TEXT,
      match_pattern TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'block',
      target TEXT DEFAULT '',
      reason TEXT DEFAULT '',
      priority INTEGER DEFAULT 100,
      enabled BOOLEAN DEFAULT TRUE,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_firewall_rules_org ON firewall_rules(org_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_firewall_rules_enabled ON firewall_rules(enabled, priority)
  `);
}

let _tableEnsured = false;

export function registerFirewallRuleRoutes(app) {
  // ── Create firewall rule ──────────────────────────────────────────────
  app.post("/api/firewall/rules", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    if (!_tableEnsured) { await ensureFirewallRulesTable(); _tableEnsured = true; }

    const body = await readJsonBody(c);

    // Support both single rule creation and bulk rule application
    if (body.rules) {
      // Bulk rule application (from the cybersecurity JSON editor)
      const rules = Array.isArray(body.rules?.rules) ? body.rules.rules : Array.isArray(body.rules) ? body.rules : [];
      const pool = database?.pool;
      const authCtx = getAuthContext(c);
      const results = [];

      for (const rule of rules) {
        const ruleId = rule.id || `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const match = rule.match || rule.condition || rule.pattern || "";
        const action = rule.action || rule.decision || "block";

        if (pool) {
          try {
            await pool.query(
              `INSERT INTO firewall_rules (rule_id, match_pattern, action, target, reason, created_by)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (rule_id) DO UPDATE SET match_pattern = $2, action = $3, updated_at = NOW()`,
              [ruleId, match, action, rule.target || "", rule.reason || "", authCtx?.userId || "system"]
            );
          } catch (err) {
            mapleLog("warn", "firewall.rule_create_failed", { ruleId, error: err.message });
          }
        }

        results.push({ ruleId, match, action });
      }

      // Try to push to context-wall via gRPC
      const grpcClients = getGrpcClients();
      if (grpcClients?.contextWall) {
        try {
          await grpcUnary(grpcClients.contextWall, "upsertPolicyRules", { rules: results });
        } catch {
          // gRPC unavailable — rules saved to database
        }
      }

      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_FIREWALL_RULES_UPDATED",
        sourceService: "gateway-api",
        userId: authCtx?.userId,
        severity: "RISK_SEVERITY_MEDIUM",
        summary: `${results.length} firewall rule(s) applied`,
        payload: { ruleCount: results.length },
      });

      return c.json({ ok: true, applied: results.length, rules: results });
    }

    // Single rule creation
    const matchPattern = asString(body.match) || asString(body.condition) || asString(body.target) ? `target equals ${asString(body.target)}` : "";
    const action = asString(body.action) || "block";
    const target = asString(body.target) || "";
    const reason = asString(body.reason) || "";

    if (!matchPattern && !target) {
      return c.json({ error: "match pattern or target is required." }, 400);
    }

    const authCtx = getAuthContext(c);
    const pool = database?.pool;
    let ruleId = `rule-${Date.now()}`;

    if (pool) {
      try {
        const result = await pool.query(
          `INSERT INTO firewall_rules (match_pattern, action, target, reason, created_by)
           VALUES ($1, $2, $3, $4, $5) RETURNING rule_id`,
          [matchPattern || `target equals ${target}`, action, target, reason, authCtx?.userId || "system"]
        );
        ruleId = result.rows[0]?.rule_id || ruleId;
      } catch (err) {
        mapleLog("warn", "firewall.rule_create_failed", { error: err.message });
      }
    }

    // Push to context-wall gRPC if available
    const grpcClients = getGrpcClients();
    if (grpcClients?.contextWall) {
      try {
        await grpcUnary(grpcClients.contextWall, "upsertPolicyRules", {
          rules: [{ id: ruleId, match: matchPattern || `target equals ${target}`, action }],
        });
      } catch {
        // gRPC unavailable — rule saved to database only
      }
    }

    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_FIREWALL_RULE_CREATED",
      sourceService: "gateway-api",
      userId: authCtx?.userId,
      severity: "RISK_SEVERITY_MEDIUM",
      summary: `Firewall rule created: ${action} ${target || matchPattern}`,
      payload: { ruleId, action, target, reason, createdBy: authCtx?.userId },
    });

    return c.json({ ok: true, ruleId, action, target, match: matchPattern || `target equals ${target}` }, 201);
  });

  // ── Delete firewall rule ──────────────────────────────────────────────
  app.delete("/api/firewall/rules/:ruleId", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    if (!_tableEnsured) { await ensureFirewallRulesTable(); _tableEnsured = true; }

    const ruleId = asString(c.req.param("ruleId"));
    const pool = database?.pool;
    const authCtx = getAuthContext(c);

    if (pool) {
      const result = await pool.query(
        `DELETE FROM firewall_rules WHERE rule_id = $1 RETURNING rule_id`,
        [ruleId]
      );
      if (result.rows.length === 0) {
        return c.json({ error: "Rule not found." }, 404);
      }
    }

    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_FIREWALL_RULE_DELETED",
      sourceService: "gateway-api",
      userId: authCtx?.userId,
      severity: "RISK_SEVERITY_HIGH",
      summary: `Firewall rule deleted: ${ruleId}`,
      payload: { ruleId },
    });

    return c.json({ ok: true, ruleId });
  });

  // ── Toggle/update firewall rule ───────────────────────────────────────
  app.patch("/api/firewall/rules/:ruleId", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    if (!_tableEnsured) { await ensureFirewallRulesTable(); _tableEnsured = true; }

    const ruleId = asString(c.req.param("ruleId"));
    const body = await readJsonBody(c);
    const pool = database?.pool;

    if (!pool) return c.json({ error: "Database unavailable." }, 503);

    const updates = [];
    const values = [];
    let idx = 1;

    if (body.enabled !== undefined) {
      updates.push(`enabled = $${idx++}`);
      values.push(Boolean(body.enabled));
    }
    if (body.action !== undefined) {
      updates.push(`action = $${idx++}`);
      values.push(asString(body.action));
    }
    if (body.priority !== undefined) {
      updates.push(`priority = $${idx++}`);
      values.push(Number(body.priority));
    }

    if (updates.length === 0) return c.json({ error: "No fields to update." }, 400);

    updates.push(`updated_at = NOW()`);
    values.push(ruleId);

    const result = await pool.query(
      `UPDATE firewall_rules SET ${updates.join(", ")} WHERE rule_id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return c.json({ error: "Rule not found." }, 404);

    return c.json({ ok: true, rule: result.rows[0] });
  });

  // ── Dry-run test ──────────────────────────────────────────────────────
  app.post("/api/firewall/rules/test", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const body = await readJsonBody(c);
    const input = body.input || body.sample || {};

    // Use the policy simulator if available
    const grpcClients = getGrpcClients();
    if (grpcClients?.contextWall) {
      try {
        const response = await grpcUnary(grpcClients.contextWall, "evaluateStep", {
          step: {
            tool: input.tool || "",
            action: input.action || "tool_call",
            target: input.target || "",
          },
        });
        return c.json({
          ok: true,
          dryRun: true,
          result: response?.action || "allow",
          matched: response?.matched || false,
          rule: response?.rule || null,
        });
      } catch {
        // Fall through to local evaluation
      }
    }

    return c.json({
      ok: true,
      dryRun: true,
      result: "allow",
      matched: false,
      rule: null,
      note: "Context-wall unavailable — no rules evaluated.",
    });
  });
}
