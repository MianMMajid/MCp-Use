import { database } from "../state.js";
import { requireApiKeyResponse } from "../auth.js";
import { mapleLog } from "../logging.js";
import { apiErrorResponse } from "../api-error.js";
import { ToolGovernanceStore } from "../core/tool-governance-store.js";

let _store;
function getGovernanceStore() {
  if (!_store) {
    _store = new ToolGovernanceStore({ database });
  }
  return _store;
}

/**
 * Validate a tool policy object. Returns { valid, errors }.
 */
function validateToolPolicy(policy) {
  const errors = [];
  if (!policy || typeof policy !== "object") {
    errors.push("Policy must be an object.");
    return { valid: false, errors };
  }
  const mode = String(policy.mode ?? "").trim();
  if (mode && !["allowlist", "blocklist", "audit"].includes(mode)) {
    errors.push(`Invalid policy mode "${mode}"; must be one of: allowlist, blocklist, audit.`);
  }
  const rules = policy.rules;
  if (rules !== undefined && !Array.isArray(rules)) {
    errors.push("rules must be an array.");
  }
  if (Array.isArray(rules)) {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!rule || typeof rule !== "object") {
        errors.push(`Rule ${i} must be an object.`);
        continue;
      }
      if (!String(rule.match ?? "").trim() && !String(rule.toolId ?? "").trim()) {
        errors.push(`Rule ${i} must have a match or toolId field.`);
      }
      const action = String(rule.action ?? "").trim();
      if (action && !["allow", "block", "audit", "warn"].includes(action)) {
        errors.push(`Rule ${i} has invalid action "${action}".`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * M3-13..16: Tool governance routes.
 *
 * GET  /api/tools                   — list registered tools
 * GET  /api/tools/:toolId           — get single tool
 * PUT  /api/tools/:toolId           — upsert tool (register/update)
 * GET  /api/tools/policies          — list tool policies
 * POST /api/tools/policies/validate — validate a tool policy
 */
export function registerToolGovernanceRoutes(app) {
  // GET /api/tools — list registered tools
  app.get("/api/tools", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    try {
      const store = getGovernanceStore();
      const items = await store.listTools();
      return c.json({ ok: true, items });
    } catch (err) {
      mapleLog("warn", "tool_governance_list_failed", { error: err.message });
      return c.json({ ok: true, items: [] });
    }
  });

  // GET /api/tools/policies — list tool policies
  // NOTE: must be registered BEFORE /api/tools/:toolId to avoid "policies" being matched as toolId
  app.get("/api/tools/policies", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    try {
      const store = getGovernanceStore();
      const items = await store.listPolicies();
      return c.json({ ok: true, items });
    } catch (err) {
      mapleLog("warn", "tool_governance_policies_list_failed", { error: err.message });
      return c.json({ ok: true, items: [] });
    }
  });

  // POST /api/tools/policies/validate — validate a tool policy
  app.post("/api/tools/policies/validate", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const body = await c.req.json().catch(() => ({}));
    const policy = body?.policy ?? body;

    const result = validateToolPolicy(policy);
    return c.json(
      {
        ok: result.valid,
        valid: result.valid,
        errors: result.errors,
      },
      result.valid ? 200 : 400
    );
  });

  // GET /api/tools/:toolId — get single tool
  app.get("/api/tools/:toolId", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const toolId = String(c.req.param("toolId") ?? "").trim();
    if (!toolId) {
      return apiErrorResponse(c, 400, "INVALID_ARGUMENT", "toolId is required.");
    }

    try {
      const store = getGovernanceStore();
      const tool = await store.getTool(toolId);
      if (!tool) {
        return apiErrorResponse(c, 404, "NOT_FOUND", "Tool not found.");
      }
      return c.json({ ok: true, tool });
    } catch (err) {
      mapleLog("warn", "tool_governance_get_failed", { toolId, error: err.message });
      return apiErrorResponse(c, 500, "INTERNAL", "Failed to fetch tool.", err.message);
    }
  });

  // PUT /api/tools/:toolId — upsert tool (register/update)
  app.put("/api/tools/:toolId", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const toolId = String(c.req.param("toolId") ?? "").trim();
    if (!toolId) {
      return apiErrorResponse(c, 400, "INVALID_ARGUMENT", "toolId is required.");
    }

    const body = await c.req.json().catch(() => ({}));

    try {
      const store = getGovernanceStore();
      const tool = await store.upsertTool({
        toolId,
        name: body?.name,
        description: body?.description,
        schema: body?.schema,
        source: body?.source,
      });
      return c.json({ ok: true, tool });
    } catch (err) {
      mapleLog("warn", "tool_governance_upsert_failed", { toolId, error: err.message });
      return apiErrorResponse(c, 500, "INTERNAL", "Failed to upsert tool.", err.message);
    }
  });
}
