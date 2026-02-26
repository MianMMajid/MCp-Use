import { randomUUID } from "node:crypto";

const DEFAULT_POLICY = {
  policyId: "default-tool-policy",
  mode: "allowlist",
  description: "Default gateway tool governance policy.",
  rules: [],
};

function hasPool(database) {
  return Boolean(database && typeof database.pool?.query === "function");
}

function nowIso() {
  return new Date().toISOString();
}

function parseJson(rawValue, fallback) {
  try {
    return JSON.parse(String(rawValue ?? ""));
  } catch {
    return fallback;
  }
}

export class ToolGovernanceStore {
  constructor(options = {}) {
    this.database = options.database;
    this.initialized = false;
    this.memory = {
      tools: new Map(),
      policies: new Map([[DEFAULT_POLICY.policyId, { ...DEFAULT_POLICY }]]),
    };
  }

  async ensureInitialized() {
    if (this.initialized) {
      return;
    }
    if (hasPool(this.database)) {
      await this.database.pool.query(`
        CREATE TABLE IF NOT EXISTS gateway_tool_registry (
          tool_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          schema_json TEXT NOT NULL,
          source TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS gateway_tool_policies (
          policy_id TEXT PRIMARY KEY,
          policy_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      const result = await this.database.pool.query(
        `SELECT policy_id FROM gateway_tool_policies WHERE policy_id = $1 LIMIT 1`,
        [DEFAULT_POLICY.policyId]
      );
      if (!result.rows[0]) {
        const timestamp = nowIso();
        await this.database.pool.query(
          `
            INSERT INTO gateway_tool_policies (
              policy_id, policy_json, created_at, updated_at
            ) VALUES ($1, $2, $3, $3)
          `,
          [DEFAULT_POLICY.policyId, JSON.stringify(DEFAULT_POLICY), timestamp]
        );
      }
    }
    this.initialized = true;
  }

  async listTools() {
    await this.ensureInitialized();
    if (!hasPool(this.database)) {
      return [...this.memory.tools.values()].sort((a, b) =>
        String(a.toolId).localeCompare(String(b.toolId))
      );
    }
    const result = await this.database.pool.query(
      `
        SELECT tool_id, name, description, schema_json, source, created_at, updated_at
        FROM gateway_tool_registry
        ORDER BY updated_at DESC
      `
    );
    return result.rows.map((row) => ({
      toolId: String(row.tool_id),
      name: String(row.name),
      description: String(row.description ?? ""),
      schema: parseJson(row.schema_json, {}),
      source: String(row.source ?? "manual"),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  async getTool(toolId) {
    await this.ensureInitialized();
    const normalizedToolId = String(toolId ?? "").trim();
    if (!normalizedToolId) {
      return null;
    }
    if (!hasPool(this.database)) {
      return this.memory.tools.get(normalizedToolId) ?? null;
    }
    const result = await this.database.pool.query(
      `
        SELECT tool_id, name, description, schema_json, source, created_at, updated_at
        FROM gateway_tool_registry
        WHERE tool_id = $1
        LIMIT 1
      `,
      [normalizedToolId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      toolId: String(row.tool_id),
      name: String(row.name),
      description: String(row.description ?? ""),
      schema: parseJson(row.schema_json, {}),
      source: String(row.source ?? "manual"),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async upsertTool(input) {
    await this.ensureInitialized();
    const toolId = String(input.toolId ?? "").trim();
    if (!toolId) {
      throw new Error("toolId is required.");
    }
    const now = nowIso();
    const payload = {
      toolId,
      name: String(input.name ?? toolId).trim() || toolId,
      description: String(input.description ?? "").trim(),
      schema: input.schema && typeof input.schema === "object" ? input.schema : {},
      source: String(input.source ?? "manual").trim() || "manual",
      createdAt: now,
      updatedAt: now,
    };

    if (!hasPool(this.database)) {
      const existing = this.memory.tools.get(toolId);
      if (existing) {
        payload.createdAt = existing.createdAt;
      }
      this.memory.tools.set(toolId, payload);
      return payload;
    }

    await this.database.pool.query(
      `
        INSERT INTO gateway_tool_registry (
          tool_id, name, description, schema_json, source, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $6)
        ON CONFLICT (tool_id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          schema_json = EXCLUDED.schema_json,
          source = EXCLUDED.source,
          updated_at = EXCLUDED.updated_at
      `,
      [
        payload.toolId,
        payload.name,
        payload.description,
        JSON.stringify(payload.schema),
        payload.source,
        payload.createdAt,
      ]
    );
    return (await this.getTool(payload.toolId)) ?? payload;
  }

  async listPolicies() {
    await this.ensureInitialized();
    if (!hasPool(this.database)) {
      return [...this.memory.policies.values()];
    }
    const result = await this.database.pool.query(
      `
        SELECT policy_id, policy_json, created_at, updated_at
        FROM gateway_tool_policies
        ORDER BY updated_at DESC
      `
    );
    return result.rows.map((row) => {
      const parsed = parseJson(row.policy_json, {});
      return {
        policyId: String(row.policy_id),
        mode: String(parsed.mode ?? "allowlist"),
        description: String(parsed.description ?? ""),
        rules: Array.isArray(parsed.rules) ? parsed.rules : [],
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      };
    });
  }

  async savePolicy(input) {
    await this.ensureInitialized();
    const policyId = String(input.policyId ?? "").trim() || randomUUID();
    const now = nowIso();
    const payload = {
      policyId,
      mode: String(input.mode ?? "allowlist"),
      description: String(input.description ?? ""),
      rules: Array.isArray(input.rules) ? input.rules : [],
      createdAt: now,
      updatedAt: now,
    };

    if (!hasPool(this.database)) {
      const existing = this.memory.policies.get(policyId);
      if (existing) {
        payload.createdAt = existing.createdAt;
      }
      this.memory.policies.set(policyId, payload);
      return payload;
    }

    await this.database.pool.query(
      `
        INSERT INTO gateway_tool_policies (policy_id, policy_json, created_at, updated_at)
        VALUES ($1, $2, $3, $3)
        ON CONFLICT (policy_id) DO UPDATE SET
          policy_json = EXCLUDED.policy_json,
          updated_at = EXCLUDED.updated_at
      `,
      [policyId, JSON.stringify(payload), payload.createdAt]
    );
    const items = await this.listPolicies();
    return items.find((item) => item.policyId === policyId) ?? payload;
  }
}
