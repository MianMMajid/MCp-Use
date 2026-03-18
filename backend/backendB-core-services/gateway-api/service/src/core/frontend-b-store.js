import { randomUUID } from "node:crypto";

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

function normalizeTask(row) {
  if (!row) {
    return null;
  }
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id ?? ""),
    title: String(row.title ?? ""),
    prompt: String(row.prompt ?? ""),
    status: String(row.status ?? "scheduled"),
    schedule: parseJson(row.schedule_json, {}),
    assignment: parseJson(row.assignment_json, {}),
    runCount: Number(row.run_count ?? 0),
    lastRunAt: row.last_run_at ? String(row.last_run_at) : null,
    nextRunAt: row.next_run_at ? String(row.next_run_at) : null,
    terminalState: row.terminal_state ? String(row.terminal_state) : "",
    terminalReason: row.terminal_reason ? String(row.terminal_reason) : "",
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function normalizeFirewallEntry(row) {
  return {
    id: String(row.entry_id),
    kind: String(row.kind ?? "text"),
    name: String(row.name ?? ""),
    mimeType: String(row.mime_type ?? "text/plain"),
    sizeBytes: Number(row.size_bytes ?? 0),
    preview: String(row.preview_text ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

function normalizeFirewallVersion(row) {
  return {
    id: String(row.version_id),
    timestamp: String(row.created_at ?? ""),
    text: String(row.policy_text ?? ""),
    actor: String(row.created_by ?? "system"),
    active: Boolean(row.is_active),
    compiled: row.compile_ok === null || row.compile_ok === undefined ? null : Boolean(row.compile_ok),
    compiledAt: row.compiled_at ? String(row.compiled_at) : null,
    compiledPolicy: parseJson(row.compiled_policy_json, null),
    compileErrors: parseJson(row.compile_errors_json, []),
    compileWarnings: parseJson(row.compile_warnings_json, []),
  };
}

function buildAuditLog(events) {
  return events.map((event) => ({
    id: event.id,
    timestamp: event.createdAt,
    level: event.level,
    message: event.message,
  }));
}

function buildBlockedPackets(events) {
  return events
    .filter((event) => event.type === "simulate_blocked" || event.type === "validate_blocked")
    .map((event) => ({
      id: event.id,
      timestamp: event.createdAt,
      destination: String(event.payload?.destination ?? "External"),
      snippet: String(event.payload?.snippet ?? ""),
      reason: String(event.payload?.reason ?? event.message ?? "Policy match"),
    }));
}

function deriveFirewallStatus(blockedAttempts) {
  if (blockedAttempts >= 3) {
    return "active_block";
  }
  if (blockedAttempts > 0) {
    return "review_needed";
  }
  return "monitoring";
}

export class FrontendBStore {
  constructor(options = {}) {
    this.database = options.database;
    this.initialized = false;
  }

  async ensureInitialized() {
    if (this.initialized) {
      return;
    }
    if (!hasPool(this.database)) {
      throw new Error("FrontendBStore requires PostgreSQL-backed persistence.");
    }
    await this.database.pool.query(`
      CREATE TABLE IF NOT EXISTS business_orgs (
        org_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        bio TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        email_is_public BOOLEAN NOT NULL DEFAULT TRUE,
        currency TEXT NOT NULL DEFAULT 'usd',
        address TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        region TEXT NOT NULL DEFAULT '',
        postal_code TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS frontend_b_tasks (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        prompt TEXT NOT NULL DEFAULT '',
        schedule_json TEXT NOT NULL,
        assignment_json TEXT NOT NULL,
        run_count INTEGER NOT NULL DEFAULT 0,
        last_run_at TEXT,
        next_run_at TEXT,
        status TEXT NOT NULL,
        terminal_state TEXT NOT NULL DEFAULT '',
        terminal_reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_frontend_b_tasks_owner_updated
        ON frontend_b_tasks(owner_user_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_frontend_b_tasks_owner_due
        ON frontend_b_tasks(owner_user_id, next_run_at);

      CREATE TABLE IF NOT EXISTS frontend_b_firewalls (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        folder TEXT NOT NULL DEFAULT 'root',
        scope TEXT NOT NULL DEFAULT 'global',
        assigned_agent_id TEXT,
        description TEXT NOT NULL DEFAULT '',
        enforcement_level TEXT NOT NULL DEFAULT 'hard-mandatory',
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        active_version_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      ALTER TABLE frontend_b_firewalls ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
      ALTER TABLE frontend_b_firewalls ADD COLUMN IF NOT EXISTS enforcement_level TEXT NOT NULL DEFAULT 'hard-mandatory';
      CREATE INDEX IF NOT EXISTS idx_frontend_b_firewalls_owner_updated
        ON frontend_b_firewalls(owner_user_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS frontend_b_firewall_versions (
        version_id TEXT PRIMARY KEY,
        firewall_id TEXT NOT NULL REFERENCES frontend_b_firewalls(id) ON DELETE CASCADE,
        owner_user_id TEXT NOT NULL,
        policy_text TEXT NOT NULL,
        compile_ok BOOLEAN,
        compiled_policy_json TEXT NOT NULL DEFAULT 'null',
        compile_errors_json TEXT NOT NULL DEFAULT '[]',
        compile_warnings_json TEXT NOT NULL DEFAULT '[]',
        compiled_at TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_frontend_b_firewall_versions_firewall
        ON frontend_b_firewall_versions(firewall_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS frontend_b_firewall_entries (
        entry_id TEXT PRIMARY KEY,
        firewall_id TEXT NOT NULL REFERENCES frontend_b_firewalls(id) ON DELETE CASCADE,
        owner_user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        preview_text TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_frontend_b_firewall_entries_firewall
        ON frontend_b_firewall_entries(firewall_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS frontend_b_firewall_events (
        event_id TEXT PRIMARY KEY,
        firewall_id TEXT NOT NULL REFERENCES frontend_b_firewalls(id) ON DELETE CASCADE,
        owner_user_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'info',
        message TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_frontend_b_firewall_events_firewall
        ON frontend_b_firewall_events(firewall_id, created_at DESC);

      ALTER TABLE business_orgs ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
      ALTER TABLE business_orgs ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
      ALTER TABLE business_orgs ADD COLUMN IF NOT EXISTS email_is_public BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE business_orgs ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'usd';
      ALTER TABLE business_orgs ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
      ALTER TABLE business_orgs ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';
      ALTER TABLE business_orgs ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT '';
      ALTER TABLE business_orgs ADD COLUMN IF NOT EXISTS postal_code TEXT NOT NULL DEFAULT '';
      ALTER TABLE business_orgs ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '';
      ALTER TABLE frontend_b_firewall_versions ADD COLUMN IF NOT EXISTS compile_ok BOOLEAN;
      ALTER TABLE frontend_b_firewall_versions ADD COLUMN IF NOT EXISTS compiled_policy_json TEXT NOT NULL DEFAULT 'null';
      ALTER TABLE frontend_b_firewall_versions ADD COLUMN IF NOT EXISTS compile_errors_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE frontend_b_firewall_versions ADD COLUMN IF NOT EXISTS compile_warnings_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE frontend_b_firewall_versions ADD COLUMN IF NOT EXISTS compiled_at TEXT;
    `);
    this.initialized = true;
  }

  async listTasks(ownerUserId) {
    await this.ensureInitialized();
    const result = await this.database.pool.query(
      `
        SELECT *
        FROM frontend_b_tasks
        WHERE owner_user_id = $1
        ORDER BY updated_at DESC
      `,
      [ownerUserId]
    );
    return result.rows.map((row) => normalizeTask(row));
  }

  async findTask(ownerUserId, taskId) {
    await this.ensureInitialized();
    const result = await this.database.pool.query(
      `
        SELECT *
        FROM frontend_b_tasks
        WHERE owner_user_id = $1 AND id = $2
        LIMIT 1
      `,
      [ownerUserId, taskId]
    );
    return normalizeTask(result.rows[0]);
  }

  async createTask(ownerUserId, input) {
    await this.ensureInitialized();
    const createdAt = nowIso();
    const id = randomUUID();
    await this.database.pool.query(
      `
        INSERT INTO frontend_b_tasks (
          id, owner_user_id, title, prompt, schedule_json, assignment_json, run_count,
          last_run_at, next_run_at, status, terminal_state, terminal_reason, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 0, NULL, $7, $8, '', '', $9, $9)
      `,
      [
        id,
        ownerUserId,
        input.title,
        input.prompt ?? "",
        JSON.stringify(input.schedule ?? {}),
        JSON.stringify(input.assignment ?? {}),
        input.nextRunAt ?? null,
        input.status ?? "scheduled",
        createdAt,
      ]
    );
    return this.findTask(ownerUserId, id);
  }

  async updateTask(ownerUserId, taskId, updates = {}) {
    await this.ensureInitialized();
    const sets = [];
    const params = [];
    let index = 1;
    if (updates.title !== undefined) {
      sets.push(`title = $${index++}`);
      params.push(updates.title);
    }
    if (updates.prompt !== undefined) {
      sets.push(`prompt = $${index++}`);
      params.push(updates.prompt);
    }
    if (updates.schedule !== undefined) {
      sets.push(`schedule_json = $${index++}`);
      params.push(JSON.stringify(updates.schedule));
    }
    if (updates.assignment !== undefined) {
      sets.push(`assignment_json = $${index++}`);
      params.push(JSON.stringify(updates.assignment));
    }
    if (updates.runCount !== undefined) {
      sets.push(`run_count = $${index++}`);
      params.push(updates.runCount);
    }
    if (updates.lastRunAt !== undefined) {
      sets.push(`last_run_at = $${index++}`);
      params.push(updates.lastRunAt);
    }
    if (updates.nextRunAt !== undefined) {
      sets.push(`next_run_at = $${index++}`);
      params.push(updates.nextRunAt);
    }
    if (updates.status !== undefined) {
      sets.push(`status = $${index++}`);
      params.push(updates.status);
    }
    if (updates.terminalState !== undefined) {
      sets.push(`terminal_state = $${index++}`);
      params.push(updates.terminalState);
    }
    if (updates.terminalReason !== undefined) {
      sets.push(`terminal_reason = $${index++}`);
      params.push(updates.terminalReason);
    }
    if (sets.length === 0) {
      return this.findTask(ownerUserId, taskId);
    }
    sets.push(`updated_at = $${index++}`);
    params.push(nowIso());
    params.push(ownerUserId, taskId);
    const result = await this.database.pool.query(
      `
        UPDATE frontend_b_tasks
        SET ${sets.join(", ")}
        WHERE owner_user_id = $${index++} AND id = $${index++}
        RETURNING *
      `,
      params
    );
    return normalizeTask(result.rows[0]);
  }

  async deleteTask(ownerUserId, taskId) {
    await this.ensureInitialized();
    const result = await this.database.pool.query(
      `DELETE FROM frontend_b_tasks WHERE owner_user_id = $1 AND id = $2`,
      [ownerUserId, taskId]
    );
    return Number(result.rowCount ?? 0) > 0;
  }

  async listDueTasks(now = nowIso()) {
    await this.ensureInitialized();
    const result = await this.database.pool.query(
      `
        SELECT *
        FROM frontend_b_tasks
        WHERE status = 'scheduled'
          AND next_run_at IS NOT NULL
          AND next_run_at <= $1
        ORDER BY next_run_at ASC
      `,
      [now]
    );
    return result.rows.map((row) => normalizeTask(row)).filter(Boolean);
  }

  async listFirewalls(ownerUserId) {
    await this.ensureInitialized();
    const result = await this.database.pool.query(
      `
        SELECT fw.*, ver.policy_text AS active_policy_text, ver.created_at AS active_policy_created_at
        FROM frontend_b_firewalls fw
        LEFT JOIN frontend_b_firewall_versions ver
          ON ver.version_id = fw.active_version_id
        WHERE fw.owner_user_id = $1
        ORDER BY fw.updated_at DESC
      `,
      [ownerUserId]
    );
    return Promise.all(result.rows.map((row) => this.inflateFirewallRow(row)));
  }

  async findFirewall(ownerUserId, firewallId) {
    await this.ensureInitialized();
    const result = await this.database.pool.query(
      `
        SELECT fw.*, ver.policy_text AS active_policy_text, ver.created_at AS active_policy_created_at
        FROM frontend_b_firewalls fw
        LEFT JOIN frontend_b_firewall_versions ver
          ON ver.version_id = fw.active_version_id
        WHERE fw.owner_user_id = $1 AND fw.id = $2
        LIMIT 1
      `,
      [ownerUserId, firewallId]
    );
    if (!result.rows[0]) {
      return null;
    }
    return this.inflateFirewallRow(result.rows[0]);
  }

  async listActiveFirewalls(ownerUserId) {
    await this.ensureInitialized();
    const result = await this.database.pool.query(
      `
        SELECT fw.*, ver.policy_text AS active_policy_text, ver.created_at AS active_policy_created_at
        FROM frontend_b_firewalls fw
        LEFT JOIN frontend_b_firewall_versions ver
          ON ver.version_id = fw.active_version_id
        WHERE fw.owner_user_id = $1
          AND fw.archived = FALSE
          AND fw.active_version_id IS NOT NULL
        ORDER BY fw.updated_at DESC
      `,
      [ownerUserId]
    );
    return Promise.all(result.rows.map((row) => this.inflateFirewallRow(row)));
  }

  async createFirewall(ownerUserId, input) {
    await this.ensureInitialized();
    const firewallId = randomUUID();
    const timestamp = nowIso();
    const client = await this.database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
          INSERT INTO frontend_b_firewalls (
            id, owner_user_id, name, folder, scope, assigned_agent_id, description,
            enforcement_level, archived, active_version_id, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9, $10, $10)
        `,
        [
          firewallId,
          ownerUserId,
          input.name,
          input.folder ?? "root",
          input.scope ?? "global",
          input.assignedAgentId ?? null,
          input.description ?? "",
          input.enforcementLevel ?? "hard-mandatory",
          input.activeVersionId ?? null,
          timestamp,
        ]
      );
      const versionId = input.versionId ?? randomUUID();
      await client.query(
        `
          INSERT INTO frontend_b_firewall_versions (
            version_id, firewall_id, owner_user_id, policy_text, compile_ok, compiled_policy_json,
            compile_errors_json, compile_warnings_json, compiled_at, created_by, created_at
          ) VALUES ($1, $2, $3, $4, NULL, 'null', '[]', '[]', NULL, $5, $6)
        `,
        [versionId, firewallId, ownerUserId, input.policyText ?? "", input.createdBy ?? ownerUserId, timestamp]
      );
      await client.query(
        `
          INSERT INTO frontend_b_firewall_events (
            event_id, firewall_id, owner_user_id, event_type, level, message, payload_json, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          randomUUID(),
          firewallId,
          ownerUserId,
          "created",
          "safe",
          `Firewall activated for "${input.name}".`,
          JSON.stringify({ scope: input.scope ?? "global", assignedAgentId: input.assignedAgentId ?? null }),
          timestamp,
        ]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.findFirewall(ownerUserId, firewallId);
  }

  async updateFirewall(ownerUserId, firewallId, updates = {}) {
    await this.ensureInitialized();
    const sets = [];
    const params = [];
    let index = 1;
    if (updates.name !== undefined) {
      sets.push(`name = $${index++}`);
      params.push(updates.name);
    }
    if (updates.folder !== undefined) {
      sets.push(`folder = $${index++}`);
      params.push(updates.folder);
    }
    if (updates.scope !== undefined) {
      sets.push(`scope = $${index++}`);
      params.push(updates.scope);
    }
    if (updates.assignedAgentId !== undefined) {
      sets.push(`assigned_agent_id = $${index++}`);
      params.push(updates.assignedAgentId);
    }
    if (updates.description !== undefined) {
      sets.push(`description = $${index++}`);
      params.push(updates.description);
    }
    if (updates.enforcementLevel !== undefined) {
      sets.push(`enforcement_level = $${index++}`);
      params.push(updates.enforcementLevel);
    }
    if (updates.archived !== undefined) {
      sets.push(`archived = $${index++}`);
      params.push(Boolean(updates.archived));
    }
    if (updates.activeVersionId !== undefined) {
      sets.push(`active_version_id = $${index++}`);
      params.push(updates.activeVersionId);
    }
    if (sets.length === 0) {
      return this.findFirewall(ownerUserId, firewallId);
    }
    sets.push(`updated_at = $${index++}`);
    params.push(nowIso());
    params.push(ownerUserId, firewallId);
    await this.database.pool.query(
      `
        UPDATE frontend_b_firewalls
        SET ${sets.join(", ")}
        WHERE owner_user_id = $${index++} AND id = $${index++}
      `,
      params
    );
    return this.findFirewall(ownerUserId, firewallId);
  }

  async listFirewallVersions(ownerUserId, firewallId) {
    await this.ensureInitialized();
    const result = await this.database.pool.query(
      `
        SELECT ver.*,
               (fw.active_version_id = ver.version_id) AS is_active
        FROM frontend_b_firewall_versions ver
        INNER JOIN frontend_b_firewalls fw ON fw.id = ver.firewall_id
        WHERE ver.owner_user_id = $1 AND ver.firewall_id = $2
        ORDER BY ver.created_at DESC
      `,
      [ownerUserId, firewallId]
    );
    return result.rows.map((row) => normalizeFirewallVersion(row));
  }

  async createFirewallVersion(ownerUserId, firewallId, policyText, createdBy) {
    await this.ensureInitialized();
    const versionId = randomUUID();
    const timestamp = nowIso();
    await this.database.pool.query(
      `
        INSERT INTO frontend_b_firewall_versions (
          version_id, firewall_id, owner_user_id, policy_text, compile_ok, compiled_policy_json,
          compile_errors_json, compile_warnings_json, compiled_at, created_by, created_at
        ) VALUES ($1, $2, $3, $4, NULL, 'null', '[]', '[]', NULL, $5, $6)
      `,
      [versionId, firewallId, ownerUserId, policyText, createdBy ?? ownerUserId, timestamp]
    );
    return {
      id: versionId,
      timestamp,
      text: policyText,
      actor: createdBy ?? ownerUserId,
      active: false,
      compiled: null,
      compiledAt: null,
      compiledPolicy: null,
      compileErrors: [],
      compileWarnings: [],
    };
  }

  async findFirewallVersion(ownerUserId, firewallId, versionId) {
    await this.ensureInitialized();
    const result = await this.database.pool.query(
      `
        SELECT ver.*,
               (fw.active_version_id = ver.version_id) AS is_active
        FROM frontend_b_firewall_versions ver
        INNER JOIN frontend_b_firewalls fw ON fw.id = ver.firewall_id
        WHERE ver.owner_user_id = $1 AND ver.firewall_id = $2 AND ver.version_id = $3
        LIMIT 1
      `,
      [ownerUserId, firewallId, versionId]
    );
    return normalizeFirewallVersion(result.rows[0]);
  }

  async updateFirewallVersionCompilation(ownerUserId, firewallId, versionId, input = {}) {
    await this.ensureInitialized();
    await this.database.pool.query(
      `
        UPDATE frontend_b_firewall_versions
        SET compile_ok = $4,
            compiled_policy_json = $5,
            compile_errors_json = $6,
            compile_warnings_json = $7,
            compiled_at = $8
        WHERE owner_user_id = $1 AND firewall_id = $2 AND version_id = $3
      `,
      [
        ownerUserId,
        firewallId,
        versionId,
        input.compileOk === null || input.compileOk === undefined ? null : Boolean(input.compileOk),
        JSON.stringify(input.compiledPolicy ?? null),
        JSON.stringify(input.compileErrors ?? []),
        JSON.stringify(input.compileWarnings ?? []),
        input.compiledAt ?? null,
      ]
    );
    return this.findFirewallVersion(ownerUserId, firewallId, versionId);
  }

  async addFirewallEntry(ownerUserId, firewallId, input) {
    await this.ensureInitialized();
    const entryId = randomUUID();
    const timestamp = nowIso();
    await this.database.pool.query(
      `
        INSERT INTO frontend_b_firewall_entries (
          entry_id, firewall_id, owner_user_id, kind, name, mime_type, size_bytes, preview_text, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        entryId,
        firewallId,
        ownerUserId,
        input.kind,
        input.name,
        input.mimeType ?? "text/plain",
        Number(input.sizeBytes ?? 0),
        input.preview ?? "",
        timestamp,
      ]
    );
    return {
      id: entryId,
      kind: input.kind,
      name: input.name,
      mimeType: input.mimeType ?? "text/plain",
      sizeBytes: Number(input.sizeBytes ?? 0),
      preview: input.preview ?? "",
      createdAt: timestamp,
    };
  }

  async deleteFirewallEntry(ownerUserId, firewallId, entryId) {
    await this.ensureInitialized();
    const result = await this.database.pool.query(
      `
        DELETE FROM frontend_b_firewall_entries
        WHERE owner_user_id = $1 AND firewall_id = $2 AND entry_id = $3
      `,
      [ownerUserId, firewallId, entryId]
    );
    return Number(result.rowCount ?? 0) > 0;
  }

  async appendFirewallEvent(ownerUserId, firewallId, input) {
    await this.ensureInitialized();
    const timestamp = nowIso();
    const eventId = randomUUID();
    await this.database.pool.query(
      `
        INSERT INTO frontend_b_firewall_events (
          event_id, firewall_id, owner_user_id, event_type, level, message, payload_json, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        eventId,
        firewallId,
        ownerUserId,
        input.type,
        input.level ?? "info",
        input.message ?? "",
        JSON.stringify(input.payload ?? {}),
        timestamp,
      ]
    );
    return {
      id: eventId,
      type: input.type,
      level: input.level ?? "info",
      message: input.message ?? "",
      payload: input.payload ?? {},
      createdAt: timestamp,
    };
  }

  async inflateFirewallRow(row) {
    const firewallId = String(row.id);
    const ownerUserId = String(row.owner_user_id);
    const [versions, entriesResult, eventsResult] = await Promise.all([
      this.listFirewallVersions(ownerUserId, firewallId),
      this.database.pool.query(
        `
          SELECT entry_id, kind, name, mime_type, size_bytes, preview_text, created_at
          FROM frontend_b_firewall_entries
          WHERE owner_user_id = $1 AND firewall_id = $2
          ORDER BY created_at DESC
        `,
        [ownerUserId, firewallId]
      ),
      this.database.pool.query(
        `
          SELECT event_id, event_type, level, message, payload_json, created_at
          FROM frontend_b_firewall_events
          WHERE owner_user_id = $1 AND firewall_id = $2
          ORDER BY created_at DESC
          LIMIT 50
        `,
        [ownerUserId, firewallId]
      ),
    ]);

    const events = eventsResult.rows.map((event) => ({
      id: String(event.event_id),
      type: String(event.event_type),
      level: String(event.level ?? "info"),
      message: String(event.message ?? ""),
      payload: parseJson(event.payload_json, {}),
      createdAt: String(event.created_at ?? ""),
    }));
    const blockedAttempts = events.filter(
      (event) => event.type === "simulate_blocked" || event.type === "validate_blocked"
    ).length;
    const lastEvaluatedAt = events.find((event) =>
      event.type.startsWith("simulate_") || event.type.startsWith("validate_")
    )?.createdAt ?? null;
    const policyText =
      versions.find((version) => version.active)?.text
      ?? versions[0]?.text
      ?? String(row.active_policy_text ?? "");

    return {
      id: firewallId,
      name: String(row.name ?? ""),
      folder: String(row.folder ?? "root"),
      scope: String(row.scope ?? "global"),
      assignedAgentId: row.assigned_agent_id ? String(row.assigned_agent_id) : null,
      description: String(row.description ?? ""),
      enforcementLevel: String(row.enforcement_level ?? "hard-mandatory"),
      policyText,
      archived: Boolean(row.archived),
      policyVersions: versions,
      entries: entriesResult.rows.map((entry) => normalizeFirewallEntry(entry)),
      auditLog: buildAuditLog(events),
      blockedPackets: buildBlockedPackets(events),
      blockedAttempts,
      lastEvaluatedAt,
      createdAt: String(row.created_at ?? ""),
      status: deriveFirewallStatus(blockedAttempts),
    };
  }
}
