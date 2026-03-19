import { randomUUID } from "node:crypto";
import pg from "pg";
const { Pool } = pg;
function parsePayload(raw) {
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function toUserRecord(row) {
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        passwordHash: row.password_hash,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function toSubscriptionRecord(row) {
    return {
        id: row.id,
        userId: row.user_id,
        stripeCustomerId: row.stripe_customer_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        plan: row.plan,
        status: row.status,
        currentPeriodEnd: row.current_period_end,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function toIntegrationRecord(row) {
    return {
        id: row.id,
        userId: row.user_id,
        provider: row.provider,
        displayName: row.display_name,
        status: row.status,
        authType: row.auth_type,
        externalAccountId: row.external_account_id,
        scopes: parsePayload(row.scopes_json) ?? [],
        metadata: parsePayload(row.metadata_json) ?? {},
        connectedAt: row.connected_at,
        disconnectedAt: row.disconnected_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function toAgentRecord(row) {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        ownerId: row.owner_id,
        riskTier: row.risk_tier,
        status: row.status,
        capabilities: parsePayload(row.capabilities) ?? [],
        tags: parsePayload(row.tags) ?? [],
        config: parsePayload(row.config) ?? {},
        pinned: row.pinned === true || row.pinned === "true",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function toOrchestrationRecord(row) {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        ownerId: row.owner_id,
        status: row.status,
        nodes: parsePayload(row.nodes_json) ?? [],
        edges: parsePayload(row.edges_json) ?? [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function toOrchestrationVersionRecord(row) {
    return {
        id: row.id,
        orchestrationId: row.orchestration_id,
        version: row.version,
        definition: parsePayload(row.definition_json) ?? { nodes: [], edges: [] },
        createdBy: row.created_by,
        createdAt: row.created_at,
    };
}
function toOrchestrationExecutionRecord(row) {
    return {
        id: row.id,
        orchestrationId: row.orchestration_id,
        versionId: row.version_id,
        status: row.status,
        mode: row.mode,
        requestedBy: row.requested_by,
        input: parsePayload(row.input_json) ?? {},
        context: parsePayload(row.context_json) ?? {},
        runLineage: parsePayload(row.run_lineage_json) ?? [],
        createdAt: row.created_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        updatedAt: row.updated_at,
    };
}
function toNotificationRecord(row) {
    return {
        id: row.id,
        userId: row.user_id,
        type: row.type,
        title: row.title,
        body: row.body,
        read: row.read === true || row.read === "true",
        data: parsePayload(row.data) ?? {},
        createdAt: row.created_at,
    };
}
function normalizeUsername(value) {
    return value.trim().toLowerCase();
}
export class MaplePostgresDatabase {
    pool;
    initialized = false;
    constructor(connectionString) {
        const configuredConnectionString = connectionString ??
            process.env.DATABASE_URL ??
            process.env.MAPLE_DATABASE_URL;
        if (!configuredConnectionString) {
            throw new Error("DATABASE_URL (or MAPLE_DATABASE_URL) is required for PostgreSQL-backed runtime.");
        }
        const connStr = configuredConnectionString;
        this.pool = new Pool({
            connectionString: connStr,
            max: 20,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 10_000,
            maxUses: 7500,
            // NOTE: rejectUnauthorized is set to false only for Railway.app deployments
            // and when sslmode=require is explicitly set. This is acceptable for those
            // managed environments. For stricter enforcement in other deployments,
            // this should be set to true with proper CA certificates configured.
            ssl: connStr.includes("railway.app") || connStr.includes(".railway.internal") || connStr.includes("sslmode=require")
                ? { rejectUnauthorized: false }
                : undefined,
        });
    }
    async initialize() {
        if (this.initialized)
            return;
        await this.runMigrations();
        this.initialized = true;
    }
    async runMigrations() {
        const client = await this.pool.connect();
        try {
            await client.query(`
        CREATE TABLE IF NOT EXISTS traces (
          id TEXT PRIMARY KEY,
          owner_key_fingerprint TEXT,
          session_id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          data_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_traces_owner_updated
          ON traces(owner_key_fingerprint, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_traces_session_updated
          ON traces(session_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS shared_traces (
          id TEXT PRIMARY KEY,
          shared_at TEXT NOT NULL,
          behavior_signature TEXT NOT NULL,
          risk_score INTEGER NOT NULL,
          data_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_shared_traces_shared_at
          ON shared_traces(shared_at DESC);

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          normalized_username TEXT NOT NULL UNIQUE,
          email TEXT UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        -- Add role column if table already exists (idempotent migration)
        DO $$ BEGIN
          ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$;

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          revoked_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user
          ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires
          ON sessions(expires_at);

        CREATE TABLE IF NOT EXISTS subscriptions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL UNIQUE,
          stripe_customer_id TEXT UNIQUE,
          stripe_subscription_id TEXT UNIQUE,
          plan TEXT NOT NULL DEFAULT 'free',
          status TEXT NOT NULL DEFAULT 'active',
          current_period_end TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS user_integrations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          display_name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'disconnected',
          auth_type TEXT NOT NULL DEFAULT 'none',
          external_account_id TEXT,
          scopes_json TEXT NOT NULL DEFAULT '[]',
          metadata_json TEXT NOT NULL DEFAULT '{}',
          connected_at TEXT,
          disconnected_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (user_id, provider),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_user_integrations_user
          ON user_integrations(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_integrations_status
          ON user_integrations(status);
        CREATE INDEX IF NOT EXISTS idx_user_integrations_provider
          ON user_integrations(provider);

        CREATE TABLE IF NOT EXISTS audit_events (
          event_id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          source_service TEXT NOT NULL,
          trace_id TEXT,
          session_id TEXT,
          request_id TEXT,
          user_id TEXT,
          key_fingerprint TEXT,
          payload_json TEXT,
          severity TEXT,
          summary TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp
          ON audit_events(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_events_trace
          ON audit_events(trace_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_events_type
          ON audit_events(event_type, timestamp DESC);

        CREATE TABLE IF NOT EXISTS gateway_modifier_approvals (
          approval_id TEXT PRIMARY KEY,
          trace_id TEXT NOT NULL,
          step_index INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL,
          reason TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          decided_at TEXT,
          requested_by TEXT NOT NULL,
          decided_by TEXT NOT NULL DEFAULT '',
          tenant_id TEXT NOT NULL,
          org_id TEXT NOT NULL,
          device_id TEXT NOT NULL DEFAULT '',
          session_id TEXT NOT NULL DEFAULT '',
          tool TEXT NOT NULL,
          target_profile TEXT NOT NULL,
          dangerous_reasons_json TEXT NOT NULL DEFAULT '[]',
          fingerprint TEXT NOT NULL,
          command_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_gateway_modifier_approvals_scope
          ON gateway_modifier_approvals(tenant_id, org_id, status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_gateway_modifier_approvals_fingerprint
          ON gateway_modifier_approvals(fingerprint, created_at DESC);

        CREATE TABLE IF NOT EXISTS gateway_modifier_org_members (
          tenant_id TEXT NOT NULL,
          org_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role_id TEXT NOT NULL,
          permissions_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (tenant_id, org_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_gateway_modifier_org_members_role
          ON gateway_modifier_org_members(tenant_id, org_id, role_id);

        CREATE TABLE IF NOT EXISTS gateway_modifier_tenant_policies (
          tenant_id TEXT NOT NULL,
          org_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT FALSE,
          policy_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          created_by TEXT NOT NULL,
          activated_at TEXT,
          PRIMARY KEY (tenant_id, org_id, version)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_gateway_modifier_active_policy
          ON gateway_modifier_tenant_policies(tenant_id, org_id)
          WHERE is_active = TRUE;

        CREATE TABLE IF NOT EXISTS gateway_audit_outbox (
          outbox_id TEXT PRIMARY KEY,
          event_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          next_attempt_at TEXT NOT NULL,
          delivered_at TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_gateway_audit_outbox_status_next
          ON gateway_audit_outbox(status, next_attempt_at ASC, created_at ASC);

        CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          owner_id TEXT,
          risk_tier TEXT NOT NULL DEFAULT 'medium',
          status TEXT NOT NULL DEFAULT 'active',
          capabilities TEXT NOT NULL DEFAULT '[]',
          tags TEXT NOT NULL DEFAULT '[]',
          config TEXT NOT NULL DEFAULT '{}',
          pinned BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_agents_owner
          ON agents(owner_id);
        CREATE INDEX IF NOT EXISTS idx_agents_status
          ON agents(status);

        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          read BOOLEAN NOT NULL DEFAULT FALSE,
          data TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_user_read
          ON notifications(user_id, read, created_at DESC);

        CREATE TABLE IF NOT EXISTS notification_preferences (
          user_id TEXT PRIMARY KEY,
          categories_json TEXT NOT NULL DEFAULT '{}',
          channels_json TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS orchestrations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL DEFAULT 'Untitled Orchestration',
          description TEXT NOT NULL DEFAULT '',
          owner_id TEXT,
          status TEXT NOT NULL DEFAULT 'draft',
          nodes_json TEXT NOT NULL DEFAULT '[]',
          edges_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_orchestrations_owner
          ON orchestrations(owner_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_orchestrations_status
          ON orchestrations(status, updated_at DESC);

        CREATE TABLE IF NOT EXISTS orchestration_versions (
          id TEXT PRIMARY KEY,
          orchestration_id TEXT NOT NULL,
          version TEXT NOT NULL,
          definition_json TEXT NOT NULL DEFAULT '{}',
          created_by TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (orchestration_id, version),
          FOREIGN KEY (orchestration_id) REFERENCES orchestrations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_orchestration_versions_orchestration
          ON orchestration_versions(orchestration_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS orchestration_executions (
          id TEXT PRIMARY KEY,
          orchestration_id TEXT NOT NULL,
          version_id TEXT,
          status TEXT NOT NULL DEFAULT 'queued',
          mode TEXT NOT NULL DEFAULT 'live',
          requested_by TEXT NOT NULL DEFAULT 'operator',
          input_json TEXT NOT NULL DEFAULT '{}',
          context_json TEXT NOT NULL DEFAULT '{}',
          run_lineage_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (orchestration_id) REFERENCES orchestrations(id) ON DELETE CASCADE,
          FOREIGN KEY (version_id) REFERENCES orchestration_versions(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_orchestration_executions_lookup
          ON orchestration_executions(orchestration_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_orchestration_executions_status
          ON orchestration_executions(status, updated_at DESC);

        CREATE TABLE IF NOT EXISTS orchestration_execution_nodes (
          id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL,
          node_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          retry_count INTEGER NOT NULL DEFAULT 0,
          started_at TEXT,
          completed_at TEXT,
          error_text TEXT NOT NULL DEFAULT '',
          output_preview TEXT NOT NULL DEFAULT '',
          cost_json TEXT NOT NULL DEFAULT '{}',
          FOREIGN KEY (execution_id) REFERENCES orchestration_executions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_orchestration_execution_nodes_exec
          ON orchestration_execution_nodes(execution_id, node_id);

        CREATE TABLE IF NOT EXISTS orchestration_execution_edges (
          id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL,
          edge_id TEXT NOT NULL,
          source_node_id TEXT NOT NULL,
          target_node_id TEXT NOT NULL,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          delegation_policy_json TEXT NOT NULL DEFAULT '{}',
          rewired_at TEXT,
          FOREIGN KEY (execution_id) REFERENCES orchestration_executions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_orchestration_execution_edges_exec
          ON orchestration_execution_edges(execution_id, edge_id);

        CREATE TABLE IF NOT EXISTS orchestration_mutations (
          id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL,
          op TEXT NOT NULL,
          payload_json TEXT NOT NULL DEFAULT '{}',
          runtime_graph_version INTEGER NOT NULL DEFAULT 1,
          applied_at TEXT NOT NULL,
          FOREIGN KEY (execution_id) REFERENCES orchestration_executions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_orchestration_mutations_exec
          ON orchestration_mutations(execution_id, applied_at DESC);

        CREATE TABLE IF NOT EXISTS orchestration_timeline_events (
          id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL,
          orchestration_id TEXT NOT NULL,
          sequence BIGINT NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL DEFAULT '{}',
          event_ts TEXT NOT NULL,
          FOREIGN KEY (execution_id) REFERENCES orchestration_executions(id) ON DELETE CASCADE,
          FOREIGN KEY (orchestration_id) REFERENCES orchestrations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_orchestration_timeline_exec
          ON orchestration_timeline_events(execution_id, sequence ASC);

        CREATE TABLE IF NOT EXISTS cyber_security_incidents (
          incident_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT '',
          org_id TEXT NOT NULL DEFAULT '',
          correlation_key TEXT NOT NULL DEFAULT '',
          title TEXT NOT NULL DEFAULT '',
          summary TEXT NOT NULL DEFAULT '',
          severity TEXT NOT NULL DEFAULT 'RISK_SEVERITY_LOW',
          priority TEXT NOT NULL DEFAULT 'medium',
          state TEXT NOT NULL DEFAULT 'new',
          disposition TEXT NOT NULL DEFAULT '',
          escalation_state TEXT NOT NULL DEFAULT 'none',
          owner_id TEXT NOT NULL DEFAULT '',
          linked_case_id TEXT NOT NULL DEFAULT '',
          tags_json TEXT NOT NULL DEFAULT '[]',
          correlation_json TEXT NOT NULL DEFAULT '{}',
          evidence_ids_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          detected_at TEXT NOT NULL,
          resolved_at TEXT,
          closed_at TEXT,
          legal_hold BOOLEAN NOT NULL DEFAULT FALSE
        );
        CREATE INDEX IF NOT EXISTS idx_cyber_security_incidents_scope
          ON cyber_security_incidents(tenant_id, org_id, state, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_cyber_security_incidents_correlation
          ON cyber_security_incidents(tenant_id, org_id, correlation_key);

        CREATE TABLE IF NOT EXISTS cyber_security_evidence (
          evidence_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT '',
          org_id TEXT NOT NULL DEFAULT '',
          incident_id TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL,
          external_id TEXT NOT NULL DEFAULT '',
          trace_id TEXT NOT NULL DEFAULT '',
          session_id TEXT NOT NULL DEFAULT '',
          run_id TEXT NOT NULL DEFAULT '',
          url TEXT NOT NULL DEFAULT '',
          filename TEXT NOT NULL DEFAULT '',
          content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
          size_bytes BIGINT NOT NULL DEFAULT 0,
          sha256 TEXT NOT NULL DEFAULT '',
          policy_reason TEXT NOT NULL DEFAULT '',
          request_json TEXT NOT NULL DEFAULT '{}',
          response_json TEXT NOT NULL DEFAULT '{}',
          metadata_json TEXT NOT NULL DEFAULT '{}',
          scan_json TEXT NOT NULL DEFAULT '{}',
          provenance_json TEXT NOT NULL DEFAULT '{}',
          object_ref TEXT NOT NULL DEFAULT '',
          storage_path TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          archived_at TEXT,
          legal_hold BOOLEAN NOT NULL DEFAULT FALSE
        );
        CREATE INDEX IF NOT EXISTS idx_cyber_security_evidence_scope
          ON cyber_security_evidence(tenant_id, org_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_cyber_security_evidence_incident
          ON cyber_security_evidence(incident_id, created_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cyber_security_evidence_external
          ON cyber_security_evidence(source, external_id);

        CREATE TABLE IF NOT EXISTS cyber_security_quarantine_objects (
          quarantine_id TEXT PRIMARY KEY,
          evidence_id TEXT NOT NULL UNIQUE,
          tenant_id TEXT NOT NULL DEFAULT '',
          org_id TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL DEFAULT '',
          classification TEXT NOT NULL DEFAULT 'unknown',
          current_state TEXT NOT NULL DEFAULT 'pending_review',
          release_disposition TEXT NOT NULL DEFAULT '',
          review_status TEXT NOT NULL DEFAULT 'pending',
          object_ref TEXT NOT NULL DEFAULT '',
          storage_path TEXT NOT NULL DEFAULT '',
          content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
          size_bytes BIGINT NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          reviewed_at TEXT,
          reviewed_by TEXT NOT NULL DEFAULT '',
          destroyed_at TEXT,
          expires_at TEXT,
          legal_hold BOOLEAN NOT NULL DEFAULT FALSE
        );
        CREATE INDEX IF NOT EXISTS idx_cyber_security_quarantine_scope
          ON cyber_security_quarantine_objects(tenant_id, org_id, current_state, updated_at DESC);

        CREATE TABLE IF NOT EXISTS cyber_security_suppressions (
          suppression_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT '',
          org_id TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'active',
          scope_type TEXT NOT NULL,
          scope_value TEXT NOT NULL,
          provider TEXT NOT NULL DEFAULT '',
          tool TEXT NOT NULL DEFAULT '',
          policy_rule TEXT NOT NULL DEFAULT '',
          rationale TEXT NOT NULL DEFAULT '',
          rollback_path TEXT NOT NULL DEFAULT '',
          approver TEXT NOT NULL DEFAULT '',
          created_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          expires_at TEXT,
          revoked_at TEXT,
          revoked_by TEXT NOT NULL DEFAULT '',
          metadata_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_cyber_security_suppressions_scope
          ON cyber_security_suppressions(tenant_id, org_id, status, created_at DESC);

        CREATE TABLE IF NOT EXISTS cyber_security_actions (
          action_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT '',
          org_id TEXT NOT NULL DEFAULT '',
          incident_id TEXT NOT NULL DEFAULT '',
          evidence_id TEXT NOT NULL DEFAULT '',
          quarantine_id TEXT NOT NULL DEFAULT '',
          suppression_id TEXT NOT NULL DEFAULT '',
          action_type TEXT NOT NULL,
          actor_id TEXT NOT NULL DEFAULT '',
          summary TEXT NOT NULL DEFAULT '',
          payload_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cyber_security_actions_incident
          ON cyber_security_actions(incident_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_cyber_security_actions_quarantine
          ON cyber_security_actions(quarantine_id, created_at DESC);

        -- Orchestration conversations and execution tasks (persisted across restarts)
        CREATE TABLE IF NOT EXISTS orchestration_conversations (
          id TEXT NOT NULL,
          orchestration_id TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          text TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          PRIMARY KEY (orchestration_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_orchestration_conversations_orch
          ON orchestration_conversations(orchestration_id, created_at);

        CREATE TABLE IF NOT EXISTS orchestration_objective_packages (
          orchestration_id TEXT PRIMARY KEY,
          goal TEXT NOT NULL DEFAULT '',
          success_criteria TEXT NOT NULL DEFAULT '',
          runtime_limit_minutes INTEGER NOT NULL DEFAULT 60,
          budget_usd REAL NOT NULL DEFAULT 0,
          risk_ceiling TEXT NOT NULL DEFAULT 'medium',
          context_urls_json TEXT NOT NULL DEFAULT '[]',
          output_contract TEXT NOT NULL DEFAULT '',
          escalation_policy TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS orchestration_execution_tasks (
          task_id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL,
          node_id TEXT NOT NULL DEFAULT '',
          title TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'queued',
          owner_role TEXT NOT NULL DEFAULT '',
          owner_agent_id TEXT,
          due_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          history_json TEXT NOT NULL DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_orchestration_execution_tasks_exec
          ON orchestration_execution_tasks(execution_id, created_at);

        CREATE TABLE IF NOT EXISTS orchestration_execution_reassignments (
          reassignment_id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          from_role TEXT NOT NULL DEFAULT '',
          from_agent_id TEXT,
          target_role TEXT NOT NULL DEFAULT '',
          target_agent_id TEXT,
          due_at TEXT,
          repeat_interval_minutes INTEGER NOT NULL DEFAULT 0,
          max_repeats INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL,
          warnings_json TEXT NOT NULL DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_orchestration_execution_reassignments_exec
          ON orchestration_execution_reassignments(execution_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS generated_assets (
          id TEXT PRIMARY KEY,
          mime_type TEXT NOT NULL DEFAULT 'image/png',
          data BYTEA NOT NULL,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
        }
        finally {
            client.release();
        }
    }
    async loadTraces(limit = 5000) {
        const result = await this.pool.query(`SELECT data_json FROM traces ORDER BY updated_at DESC LIMIT $1`, [limit]);
        const traces = [];
        for (const row of result.rows) {
            const parsed = parsePayload(row.data_json);
            if (parsed)
                traces.push(parsed);
        }
        return traces;
    }
    async upsertTrace(trace) {
        await this.pool.query(`INSERT INTO traces (id, owner_key_fingerprint, session_id, updated_at, data_json)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET
         owner_key_fingerprint = EXCLUDED.owner_key_fingerprint,
         session_id = EXCLUDED.session_id,
         updated_at = EXCLUDED.updated_at,
         data_json = EXCLUDED.data_json`, [trace.id, trace.ownerKeyFingerprint ?? null, trace.sessionId, trace.updatedAt, JSON.stringify(trace)]);
    }
    async removeTrace(traceId) {
        await this.pool.query(`DELETE FROM traces WHERE id = $1`, [traceId]);
    }
    async loadSharedTraces(limit = 5000) {
        const result = await this.pool.query(`SELECT data_json FROM shared_traces ORDER BY shared_at DESC LIMIT $1`, [limit]);
        const traces = [];
        for (const row of result.rows) {
            const parsed = parsePayload(row.data_json);
            if (parsed)
                traces.push(parsed);
        }
        return traces;
    }
    async upsertSharedTrace(trace) {
        await this.pool.query(`INSERT INTO shared_traces (id, shared_at, behavior_signature, risk_score, data_json)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET
         shared_at = EXCLUDED.shared_at,
         behavior_signature = EXCLUDED.behavior_signature,
         risk_score = EXCLUDED.risk_score,
         data_json = EXCLUDED.data_json`, [trace.id, trace.sharedAt, trace.behaviorSignature, Math.trunc(trace.riskScore), JSON.stringify(trace)]);
    }
    async removeSharedTrace(traceId) {
        await this.pool.query(`DELETE FROM shared_traces WHERE id = $1`, [traceId]);
    }
    async countUsers() {
        const result = await this.pool.query(`SELECT COUNT(*) as count FROM users`);
        return Number(result.rows[0]?.count ?? 0);
    }
    async createUser(input) {
        const now = new Date().toISOString();
        const username = input.username.trim();
        const normalizedUsername = normalizeUsername(username);
        if (!username)
            throw new Error("Username is required.");
        const id = randomUUID();
        const role = input.role ?? "user";
        await this.pool.query(`INSERT INTO users (id, username, normalized_username, email, password_hash, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [id, username, normalizedUsername, input.email?.trim() || null, input.passwordHash, role, now, now]);
        return { id, username, email: input.email?.trim() || null, passwordHash: input.passwordHash, role, createdAt: now, updatedAt: now };
    }
    async syncUserPasswordByUsername(input) {
        const username = input.username.trim();
        const normalizedUsername = normalizeUsername(username);
        if (!normalizedUsername)
            throw new Error("Username is required.");
        const existing = await this.findUserByUsername(username);
        if (!existing)
            return this.createUser({ username, email: input.email, passwordHash: input.passwordHash, role: input.role });
        const now = new Date().toISOString();
        const role = input.role ?? existing.role ?? "user";
        await this.pool.query(`UPDATE users SET password_hash = $1, role = $2, updated_at = $3 WHERE id = $4`, [input.passwordHash, role, now, existing.id]);
        const refreshed = await this.findUserById(existing.id);
        if (!refreshed)
            throw new Error("Unable to refresh synced user.");
        return refreshed;
    }
    async findUserByUsername(username) {
        const normalized = normalizeUsername(username);
        if (!normalized)
            return undefined;
        const result = await this.pool.query(`SELECT id, username, email, password_hash, created_at, updated_at FROM users WHERE normalized_username = $1`, [normalized]);
        if (result.rows.length === 0)
            return undefined;
        return toUserRecord(result.rows[0]);
    }
    async findUserByEmail(email) {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed)
            return undefined;
        const result = await this.pool.query(`SELECT id, username, email, password_hash, created_at, updated_at FROM users WHERE LOWER(email) = $1`, [trimmed]);
        if (result.rows.length === 0)
            return undefined;
        return toUserRecord(result.rows[0]);
    }
    async findUserById(userId) {
        const result = await this.pool.query(`SELECT id, username, email, password_hash, created_at, updated_at FROM users WHERE id = $1`, [userId]);
        if (result.rows.length === 0)
            return undefined;
        return toUserRecord(result.rows[0]);
    }
    async createSession(userId, ttlSeconds) {
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + ttlSeconds * 1000);
        const sessionId = randomUUID();
        await this.pool.query(`INSERT INTO sessions (id, user_id, created_at, expires_at, revoked_at) VALUES ($1, $2, $3, $4, NULL)`, [sessionId, userId, createdAt.toISOString(), expiresAt.toISOString()]);
        return { id: sessionId, userId, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(), revokedAt: null };
    }
    async findActiveSession(sessionId, nowIso = new Date().toISOString()) {
        // Try with mfa_verified column first; fall back if column doesn't exist yet
        let result;
        try {
            result = await this.pool.query(`SELECT s.id, s.user_id, s.created_at, s.expires_at, s.revoked_at, s.mfa_verified, u.username, u.email, u.role
           FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.id = $1 AND s.revoked_at IS NULL AND s.expires_at > $2 LIMIT 1`, [sessionId, nowIso]);
        } catch (err) {
            if (err?.message?.includes("mfa_verified")) {
                result = await this.pool.query(`SELECT s.id, s.user_id, s.created_at, s.expires_at, s.revoked_at, u.username, u.email, u.role
               FROM sessions s JOIN users u ON u.id = s.user_id
               WHERE s.id = $1 AND s.revoked_at IS NULL AND s.expires_at > $2 LIMIT 1`, [sessionId, nowIso]);
            } else {
                throw err;
            }
        }
        if (result.rows.length === 0)
            return undefined;
        const row = result.rows[0];
        return {
            id: row.id, userId: row.user_id, createdAt: row.created_at, expiresAt: row.expires_at, revokedAt: row.revoked_at,
            mfaVerified: row.mfa_verified ?? false,
            user: { id: row.user_id, username: row.username, email: row.email, role: row.role ?? "user" },
        };
    }
    async revokeSession(sessionId) {
        await this.pool.query(`UPDATE sessions SET revoked_at = $1 WHERE id = $2`, [new Date().toISOString(), sessionId]);
    }
    async purgeExpiredSessions(nowIso = new Date().toISOString()) {
        const result = await this.pool.query(`DELETE FROM sessions WHERE expires_at <= $1 OR revoked_at IS NOT NULL`, [nowIso]);
        return result.rowCount ?? 0;
    }
    async findSubscriptionByUserId(userId) {
        const result = await this.pool.query(`SELECT * FROM subscriptions WHERE user_id = $1`, [userId]);
        const row = result.rows[0];
        if (!row)
            return undefined;
        return toSubscriptionRecord(row);
    }
    async findSubscriptionByStripeCustomerId(stripeCustomerId) {
        const result = await this.pool.query(`SELECT * FROM subscriptions WHERE stripe_customer_id = $1`, [stripeCustomerId]);
        const row = result.rows[0];
        if (!row)
            return undefined;
        return toSubscriptionRecord(row);
    }
    async upsertSubscription(input) {
        const now = new Date().toISOString();
        const id = randomUUID();
        const result = await this.pool.query(`INSERT INTO subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       ON CONFLICT (user_id) DO UPDATE SET
         stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
         stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, subscriptions.stripe_subscription_id),
         plan = EXCLUDED.plan, status = EXCLUDED.status,
         current_period_end = EXCLUDED.current_period_end, updated_at = EXCLUDED.updated_at
       RETURNING *`, [id, input.userId, input.stripeCustomerId ?? null, input.stripeSubscriptionId ?? null, input.plan, input.status, input.currentPeriodEnd ?? null, now]);
        return toSubscriptionRecord(result.rows[0]);
    }
    async ensureFreeSubscription(userId) {
        const existing = await this.findSubscriptionByUserId(userId);
        if (existing)
            return existing;
        return this.upsertSubscription({ userId, plan: "free", status: "active" });
    }
    async listUserIntegrations(userId) {
        const result = await this.pool.query(`SELECT * FROM user_integrations WHERE user_id = $1 ORDER BY provider ASC`, [userId]);
        return result.rows.map((row) => toIntegrationRecord(row));
    }
    async findUserIntegration(userId, provider) {
        const result = await this.pool.query(`SELECT * FROM user_integrations WHERE user_id = $1 AND provider = $2 LIMIT 1`, [userId, provider]);
        const row = result.rows[0];
        if (!row)
            return undefined;
        return toIntegrationRecord(row);
    }
    async upsertUserIntegration(input) {
        const now = new Date().toISOString();
        const id = randomUUID();
        const result = await this.pool.query(`INSERT INTO user_integrations (
          id,
          user_id,
          provider,
          display_name,
          status,
          auth_type,
          external_account_id,
          scopes_json,
          metadata_json,
          connected_at,
          disconnected_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
        ON CONFLICT (user_id, provider) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          status = EXCLUDED.status,
          auth_type = EXCLUDED.auth_type,
          external_account_id = EXCLUDED.external_account_id,
          scopes_json = EXCLUDED.scopes_json,
          metadata_json = EXCLUDED.metadata_json,
          connected_at = EXCLUDED.connected_at,
          disconnected_at = EXCLUDED.disconnected_at,
          updated_at = EXCLUDED.updated_at
        RETURNING *`, [
            id,
            input.userId,
            input.provider,
            input.displayName,
            input.status,
            input.authType,
            input.externalAccountId ?? null,
            JSON.stringify(Array.isArray(input.scopes) ? input.scopes : []),
            JSON.stringify(input.metadata ?? {}),
            input.connectedAt ?? null,
            input.disconnectedAt ?? null,
            now,
        ]);
        return toIntegrationRecord(result.rows[0]);
    }
    async disconnectUserIntegration(userId, provider) {
        const now = new Date().toISOString();
        const result = await this.pool.query(`UPDATE user_integrations
       SET status = 'disconnected',
           disconnected_at = $3,
           updated_at = $3
       WHERE user_id = $1 AND provider = $2
       RETURNING *`, [userId, provider, now]);
        const row = result.rows[0];
        if (!row)
            return undefined;
        return toIntegrationRecord(row);
    }
    async updatePasswordByUserId(userId, newPasswordHash) {
        await this.pool.query(`UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`, [newPasswordHash, new Date().toISOString(), userId]);
    }
    // ── Agent CRUD ────────────────────────────────────────────────────────────
    async createAgent(input) {
        const now = new Date().toISOString();
        const id = input.id ?? randomUUID();
        await this.pool.query(
            `INSERT INTO agents (id, name, description, owner_id, risk_tier, status, capabilities, tags, config, pinned, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
            [
                id,
                input.name,
                input.description ?? "",
                input.ownerId ?? null,
                input.riskTier ?? "medium",
                input.status ?? "active",
                JSON.stringify(input.capabilities ?? []),
                JSON.stringify(input.tags ?? []),
                JSON.stringify(input.config ?? {}),
                input.pinned === true,
                now,
            ]
        );
        return { id, name: input.name, description: input.description ?? "", ownerId: input.ownerId ?? null, riskTier: input.riskTier ?? "medium", status: input.status ?? "active", capabilities: input.capabilities ?? [], tags: input.tags ?? [], config: input.config ?? {}, pinned: input.pinned === true, createdAt: now, updatedAt: now };
    }
    async listAgents(filters = {}) {
        const conditions = [];
        const params = [];
        let idx = 1;
        if (filters.ownerId) {
            conditions.push(`owner_id = $${idx++}`);
            params.push(filters.ownerId);
        }
        if (filters.status) {
            conditions.push(`status = $${idx++}`);
            params.push(filters.status);
        } else if (!filters.includeArchived) {
            conditions.push(`status != 'archived'`);
        }
        if (filters.riskTier) {
            conditions.push(`risk_tier = $${idx++}`);
            params.push(filters.riskTier);
        }
        if (filters.pinned !== undefined) {
            conditions.push(`pinned = $${idx++}`);
            params.push(filters.pinned);
        }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
        const offset = Math.max(Number(filters.offset) || 0, 0);
        params.push(limit, offset);
        const result = await this.pool.query(
            `SELECT * FROM agents ${where} ORDER BY updated_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
            params
        );
        return result.rows.map(toAgentRecord);
    }
    async findAgentById(agentId) {
        const result = await this.pool.query(`SELECT * FROM agents WHERE id = $1`, [agentId]);
        if (result.rows.length === 0) return undefined;
        return toAgentRecord(result.rows[0]);
    }
    async updateAgent(agentId, updates) {
        const sets = [];
        const params = [];
        let idx = 1;
        if (updates.name !== undefined) { sets.push(`name = $${idx++}`); params.push(updates.name); }
        if (updates.description !== undefined) { sets.push(`description = $${idx++}`); params.push(updates.description); }
        if (updates.riskTier !== undefined) { sets.push(`risk_tier = $${idx++}`); params.push(updates.riskTier); }
        if (updates.status !== undefined) { sets.push(`status = $${idx++}`); params.push(updates.status); }
        if (updates.capabilities !== undefined) { sets.push(`capabilities = $${idx++}`); params.push(JSON.stringify(updates.capabilities)); }
        if (updates.tags !== undefined) { sets.push(`tags = $${idx++}`); params.push(JSON.stringify(updates.tags)); }
        if (updates.config !== undefined) { sets.push(`config = $${idx++}`); params.push(JSON.stringify(updates.config)); }
        if (updates.pinned !== undefined) { sets.push(`pinned = $${idx++}`); params.push(updates.pinned); }
        if (sets.length === 0) return this.findAgentById(agentId);
        const now = new Date().toISOString();
        sets.push(`updated_at = $${idx++}`);
        params.push(now);
        params.push(agentId);
        const result = await this.pool.query(
            `UPDATE agents SET ${sets.join(", ")} WHERE id = $${idx++} RETURNING *`,
            params
        );
        if (result.rows.length === 0) return undefined;
        return toAgentRecord(result.rows[0]);
    }
    async archiveAgent(agentId) {
        return this.updateAgent(agentId, { status: "archived" });
    }
    async restoreAgent(agentId) {
        return this.updateAgent(agentId, { status: "active" });
    }
    async permanentlyDeleteAgent(agentId) {
        const result = await this.pool.query(
            `DELETE FROM agents WHERE id = $1 AND status = 'archived' RETURNING *`,
            [agentId]
        );
        if (result.rows.length === 0) return undefined;
        return toAgentRecord(result.rows[0]);
    }
    async searchAgents(query, limit = 10) {
        const pattern = `%${query}%`;
        const result = await this.pool.query(
            `SELECT * FROM agents WHERE status != 'archived' AND (name ILIKE $1 OR description ILIKE $1) ORDER BY updated_at DESC LIMIT $2`,
            [pattern, limit]
        );
        return result.rows.map(toAgentRecord);
    }
    // ── Notifications ─────────────────────────────────────────────────────────
    async createNotification(input) {
        const now = new Date().toISOString();
        const id = randomUUID();
        await this.pool.query(
            `INSERT INTO notifications (id, user_id, type, title, body, read, data, created_at)
             VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7)`,
            [id, input.userId, input.type, input.title, input.body ?? "", JSON.stringify(input.data ?? {}), now]
        );
        return { id, userId: input.userId, type: input.type, title: input.title, body: input.body ?? "", read: false, data: input.data ?? {}, createdAt: now };
    }
    async listNotifications(userId, options = {}) {
        const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
        const offset = Math.max(Number(options.offset) || 0, 0);
        const result = await this.pool.query(
            `SELECT * FROM notifications WHERE user_id = $1 ORDER BY read ASC, created_at DESC LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );
        return result.rows.map(toNotificationRecord);
    }
    async markNotificationRead(notificationId) {
        await this.pool.query(`UPDATE notifications SET read = TRUE WHERE id = $1`, [notificationId]);
    }
    async markAllNotificationsRead(userId) {
        await this.pool.query(`UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE`, [userId]);
    }
    async countUnreadNotifications(userId) {
        const result = await this.pool.query(`SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = FALSE`, [userId]);
        return Number(result.rows[0]?.count ?? 0);
    }
    // ── Orchestration CRUD ──────────────────────────────────────────────────
    async createOrchestration(input) {
        const now = new Date().toISOString();
        const id = randomUUID();
        await this.pool.query(
            `INSERT INTO orchestrations (id, name, description, owner_id, status, nodes_json, edges_json, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
            [
                id,
                input.name ?? "Untitled Orchestration",
                input.description ?? "",
                input.ownerId ?? null,
                input.status ?? "draft",
                JSON.stringify(input.nodes ?? []),
                JSON.stringify(input.edges ?? []),
                now,
            ]
        );
        return { id, name: input.name ?? "Untitled Orchestration", description: input.description ?? "", ownerId: input.ownerId ?? null, status: input.status ?? "draft", nodes: input.nodes ?? [], edges: input.edges ?? [], createdAt: now, updatedAt: now };
    }
    async listOrchestrations(filters = {}) {
        const conditions = [];
        const params = [];
        let idx = 1;
        if (filters.ownerId) {
            conditions.push(`owner_id = $${idx++}`);
            params.push(filters.ownerId);
        }
        if (filters.status) {
            conditions.push(`status = $${idx++}`);
            params.push(filters.status);
        } else if (!filters.includeArchived) {
            conditions.push(`status != 'archived'`);
        }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
        const offset = Math.max(Number(filters.offset) || 0, 0);
        params.push(limit, offset);
        const result = await this.pool.query(
            `SELECT * FROM orchestrations ${where} ORDER BY updated_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
            params
        );
        return result.rows.map(toOrchestrationRecord);
    }
    async findOrchestrationById(id) {
        const result = await this.pool.query(`SELECT * FROM orchestrations WHERE id = $1`, [id]);
        if (result.rows.length === 0) return undefined;
        return toOrchestrationRecord(result.rows[0]);
    }
    async updateOrchestration(id, updates) {
        const sets = [];
        const params = [];
        let idx = 1;
        if (updates.name !== undefined) { sets.push(`name = $${idx++}`); params.push(updates.name); }
        if (updates.description !== undefined) { sets.push(`description = $${idx++}`); params.push(updates.description); }
        if (updates.status !== undefined) { sets.push(`status = $${idx++}`); params.push(updates.status); }
        if (updates.nodes !== undefined) { sets.push(`nodes_json = $${idx++}`); params.push(JSON.stringify(updates.nodes)); }
        if (updates.edges !== undefined) { sets.push(`edges_json = $${idx++}`); params.push(JSON.stringify(updates.edges)); }
        if (sets.length === 0) return this.findOrchestrationById(id);
        const now = new Date().toISOString();
        sets.push(`updated_at = $${idx++}`);
        params.push(now);
        params.push(id);
        const result = await this.pool.query(
            `UPDATE orchestrations SET ${sets.join(", ")} WHERE id = $${idx++} RETURNING *`,
            params
        );
        if (result.rows.length === 0) return undefined;
        return toOrchestrationRecord(result.rows[0]);
    }
    async listOrchestrationVersions(orchestrationId, limit = 50) {
        const bounded = Math.min(Math.max(Number(limit) || 50, 1), 200);
        const result = await this.pool.query(
            `SELECT *
               FROM orchestration_versions
              WHERE orchestration_id = $1
              ORDER BY created_at DESC
              LIMIT $2`,
            [orchestrationId, bounded]
        );
        return result.rows.map(toOrchestrationVersionRecord);
    }
    async findOrchestrationVersion(orchestrationId, version) {
        const result = await this.pool.query(
            `SELECT *
               FROM orchestration_versions
              WHERE orchestration_id = $1
                AND version = $2
              LIMIT 1`,
            [orchestrationId, version]
        );
        if (result.rows.length === 0) return undefined;
        return toOrchestrationVersionRecord(result.rows[0]);
    }
    async findLatestOrchestrationVersion(orchestrationId) {
        const result = await this.pool.query(
            `SELECT *
               FROM orchestration_versions
              WHERE orchestration_id = $1
              ORDER BY created_at DESC
              LIMIT 1`,
            [orchestrationId]
        );
        if (result.rows.length === 0) return undefined;
        return toOrchestrationVersionRecord(result.rows[0]);
    }
    async createOrchestrationVersion(input) {
        const now = new Date().toISOString();
        const id = randomUUID();
        let version = input.version;
        if (!version) {
            const result = await this.pool.query(
                `SELECT COUNT(*)::int AS count
                   FROM orchestration_versions
                  WHERE orchestration_id = $1`,
                [input.orchestrationId]
            );
            const count = Number(result.rows[0]?.count ?? 0);
            version = `v${count + 1}`;
        }
        const definition = input.definition ?? { nodes: [], edges: [] };
        const inserted = await this.pool.query(
            `INSERT INTO orchestration_versions (id, orchestration_id, version, definition_json, created_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (orchestration_id, version) DO UPDATE
             SET definition_json = EXCLUDED.definition_json,
                 created_by = EXCLUDED.created_by,
                 created_at = EXCLUDED.created_at
             RETURNING *`,
            [
                id,
                input.orchestrationId,
                version,
                JSON.stringify(definition),
                input.createdBy ?? null,
                now,
            ]
        );
        return toOrchestrationVersionRecord(inserted.rows[0]);
    }
    async createOrchestrationExecutionRecord(input) {
        const now = new Date().toISOString();
        const id = input.id ?? randomUUID();
        const result = await this.pool.query(
            `INSERT INTO orchestration_executions (
              id,
              orchestration_id,
              version_id,
              status,
              mode,
              requested_by,
              input_json,
              context_json,
              run_lineage_json,
              created_at,
              started_at,
              completed_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $10)
            ON CONFLICT (id) DO UPDATE
            SET status = EXCLUDED.status,
                mode = EXCLUDED.mode,
                requested_by = EXCLUDED.requested_by,
                input_json = EXCLUDED.input_json,
                context_json = EXCLUDED.context_json,
                run_lineage_json = EXCLUDED.run_lineage_json,
                started_at = EXCLUDED.started_at,
                completed_at = EXCLUDED.completed_at,
                updated_at = EXCLUDED.updated_at
            RETURNING *`,
            [
                id,
                input.orchestrationId,
                input.versionId ?? null,
                input.status ?? "queued",
                input.mode ?? "live",
                input.requestedBy ?? "operator",
                JSON.stringify(input.input ?? {}),
                JSON.stringify(input.context ?? {}),
                JSON.stringify(input.runLineage ?? []),
                input.createdAt ?? now,
                input.startedAt ?? null,
                input.completedAt ?? null,
            ]
        );
        return toOrchestrationExecutionRecord(result.rows[0]);
    }
    async updateOrchestrationExecutionRecord(id, updates = {}) {
        const sets = [];
        const params = [];
        let idx = 1;
        if (updates.status !== undefined) { sets.push(`status = $${idx++}`); params.push(updates.status); }
        if (updates.mode !== undefined) { sets.push(`mode = $${idx++}`); params.push(updates.mode); }
        if (updates.versionId !== undefined) { sets.push(`version_id = $${idx++}`); params.push(updates.versionId); }
        if (updates.requestedBy !== undefined) { sets.push(`requested_by = $${idx++}`); params.push(updates.requestedBy); }
        if (updates.input !== undefined) { sets.push(`input_json = $${idx++}`); params.push(JSON.stringify(updates.input)); }
        if (updates.context !== undefined) { sets.push(`context_json = $${idx++}`); params.push(JSON.stringify(updates.context)); }
        if (updates.runLineage !== undefined) { sets.push(`run_lineage_json = $${idx++}`); params.push(JSON.stringify(updates.runLineage)); }
        if (updates.startedAt !== undefined) { sets.push(`started_at = $${idx++}`); params.push(updates.startedAt); }
        if (updates.completedAt !== undefined) { sets.push(`completed_at = $${idx++}`); params.push(updates.completedAt); }
        if (sets.length === 0) {
            const existing = await this.pool.query(`SELECT * FROM orchestration_executions WHERE id = $1`, [id]);
            if (existing.rows.length === 0) return undefined;
            return toOrchestrationExecutionRecord(existing.rows[0]);
        }
        sets.push(`updated_at = $${idx++}`);
        params.push(new Date().toISOString());
        params.push(id);
        const result = await this.pool.query(
            `UPDATE orchestration_executions
                SET ${sets.join(", ")}
              WHERE id = $${idx++}
              RETURNING *`,
            params
        );
        if (result.rows.length === 0) return undefined;
        return toOrchestrationExecutionRecord(result.rows[0]);
    }
    async appendOrchestrationTimelineEvents(executionId, orchestrationId, events = []) {
        if (!Array.isArray(events) || events.length === 0) return 0;
        const COLS = 7;
        const placeholders = [];
        const params = [];
        for (let i = 0; i < events.length; i++) {
            const offset = i * COLS;
            placeholders.push(
                `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`
            );
            const event = events[i];
            params.push(
                event.id ?? randomUUID(),
                executionId,
                orchestrationId,
                Number(event.sequence ?? 0),
                event.eventType ?? event.type ?? "event",
                JSON.stringify(event.payload ?? event),
                event.timestamp ?? new Date().toISOString(),
            );
        }
        await this.pool.query(
            `INSERT INTO orchestration_timeline_events (
              id, execution_id, orchestration_id, sequence, event_type, payload_json, event_ts
            ) VALUES ${placeholders.join(", ")}
            ON CONFLICT (id) DO NOTHING`,
            params
        );
        return events.length;
    }
    async archiveOrchestration(id) {
        return this.updateOrchestration(id, { status: "archived" });
    }
    async restoreOrchestration(id) {
        return this.updateOrchestration(id, { status: "draft" });
    }
    async permanentlyDeleteOrchestration(id) {
        const result = await this.pool.query(
            `DELETE FROM orchestrations WHERE id = $1 AND status = 'archived' RETURNING *`,
            [id]
        );
        if (result.rows.length === 0) return undefined;
        return toOrchestrationRecord(result.rows[0]);
    }
    async close() {
        await this.pool.end();
    }
}
//# sourceMappingURL=pg-db.js.map
