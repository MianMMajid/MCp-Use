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
function toTaskRecord(row) {
    return {
        id: row.id,
        title: row.title,
        prompt: row.prompt,
        status: row.status,
        schedule: parsePayload(row.schedule_json) ?? {},
        assignment: parsePayload(row.assignment_json) ?? {},
        createdBy: row.created_by,
        lastRunAt: row.last_run_at,
        nextRunAt: row.next_run_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function toOrchestrationConversationRecord(row) {
    return {
        id: row.id,
        orchestrationId: row.orchestration_id,
        role: row.role,
        text: row.text,
        createdAt: row.created_at,
        metadata: parsePayload(row.metadata_json) ?? {},
    };
}
function toOrchestrationExecutionTaskRecord(row) {
    return {
        id: row.id,
        taskId: row.task_id,
        executionId: row.execution_id,
        nodeId: row.node_id,
        title: row.title,
        status: row.status,
        ownerRole: row.owner_role,
        ownerAgentId: row.owner_agent_id,
        dueAt: row.due_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        history: parsePayload(row.history_json) ?? [],
    };
}
function toOrchestrationExecutionReassignmentRecord(row) {
    return {
        id: row.id,
        reassignmentId: row.reassignment_id,
        executionId: row.execution_id,
        taskId: row.task_id,
        dueAt: row.due_at,
        repeatIntervalMinutes: Number(row.repeat_interval_minutes ?? 0),
        maxRepeats: Number(row.max_repeats ?? 1),
        targetRole: row.target_role ?? null,
        targetAgentId: row.target_agent_id ?? null,
        reason: row.reason ?? "",
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function toOpenClawSessionRecord(row) {
    return {
        sessionId: row.session_id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastRunId: row.last_run_id ?? "",
        lastError: row.last_error ?? "",
        cancelRequested: row.cancel_requested === true || row.cancel_requested === "true",
        runCount: Number(row.run_count ?? 0),
        metadata: parsePayload(row.metadata_json) ?? {},
    };
}
function toOpenClawRunRecord(row) {
    return {
        runId: row.run_id,
        sessionId: row.session_id,
        type: row.type,
        status: row.status,
        input: parsePayload(row.input_json) ?? {},
        output: parsePayload(row.output_json) ?? null,
        error: row.error ?? "",
        artifacts: parsePayload(row.artifacts_json) ?? [],
        cost: parsePayload(row.cost_json) ?? null,
        parentRunId: row.parent_run_id ?? null,
        childRunIds: parsePayload(row.child_run_ids_json) ?? [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function toOpenClawSessionEventRecord(row) {
    return {
        id: row.id,
        sequence: Number(row.sequence ?? 0),
        cursor: String(row.sequence ?? "0"),
        sessionId: row.session_id,
        eventType: row.event_type,
        timestamp: row.event_ts,
        payload: parsePayload(row.payload_json) ?? {},
    };
}
function toFirewallObjectRecord(row) {
    return {
        id: row.id,
        name: row.name,
        folder: row.folder,
        policyText: row.policy_text,
        scope: row.scope,
        assignedAgentId: row.assigned_agent_id ?? null,
        status: row.status,
        rulesCount: Number(row.rules_count ?? 1),
        blockedAttempts: Number(row.blocked_attempts ?? 0),
        archived: row.archived === true || row.archived === "true",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastEvaluatedAt: row.last_evaluated_at ?? null,
    };
}
function toFirewallSnippetRecord(row) {
    return {
        id: row.id,
        firewallObjectId: row.firewall_object_id,
        kind: row.kind,
        name: row.name,
        mimeType: row.mime_type,
        sizeBytes: Number(row.size_bytes ?? 0),
        preview: row.preview ?? "",
        content: row.content ?? "",
        addedAt: row.added_at,
    };
}
function toSkillCustomRecord(row) {
    return {
        id: row.id,
        name: row.name,
        description: row.description ?? "",
        fileName: row.file_name ?? "",
        sizeBytes: Number(row.size_bytes ?? 0),
        importedAt: row.imported_at,
        metadata: parsePayload(row.metadata_json) ?? {},
    };
}
function toSkillActivityRecord(row) {
    return {
        id: row.id,
        skillId: row.skill_id,
        skillName: row.skill_name,
        status: row.status,
        timestamp: row.timestamp,
        metadata: parsePayload(row.metadata_json) ?? {},
    };
}
function toChatConversationRecord(row) {
    return {
        id: row.id,
        title: row.title ?? "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: parsePayload(row.metadata_json) ?? {},
    };
}
function toChatMessageRecord(row) {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        role: row.role,
        content: row.content,
        streamState: row.stream_state,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: parsePayload(row.metadata_json) ?? {},
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
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

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

        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          prompt TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'queued',
          schedule_json TEXT NOT NULL DEFAULT '{}',
          assignment_json TEXT NOT NULL DEFAULT '{}',
          created_by TEXT,
          last_run_at TEXT,
          next_run_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_status_updated
          ON tasks(status, updated_at DESC);

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

        CREATE TABLE IF NOT EXISTS orchestration_conversation_messages (
          id TEXT PRIMARY KEY,
          orchestration_id TEXT NOT NULL,
          role TEXT NOT NULL,
          text TEXT NOT NULL,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          FOREIGN KEY (orchestration_id) REFERENCES orchestrations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_orchestration_conversation_lookup
          ON orchestration_conversation_messages(orchestration_id, created_at ASC);

        CREATE TABLE IF NOT EXISTS orchestration_execution_tasks (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          execution_id TEXT NOT NULL,
          node_id TEXT NOT NULL DEFAULT '',
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued',
          owner_role TEXT NOT NULL DEFAULT '',
          owner_agent_id TEXT,
          due_at TEXT,
          history_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (execution_id, task_id),
          FOREIGN KEY (execution_id) REFERENCES orchestration_executions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_orchestration_execution_tasks_lookup
          ON orchestration_execution_tasks(execution_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS orchestration_execution_reassignments (
          id TEXT PRIMARY KEY,
          reassignment_id TEXT NOT NULL,
          execution_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          due_at TEXT NOT NULL,
          repeat_interval_minutes INTEGER NOT NULL DEFAULT 0,
          max_repeats INTEGER NOT NULL DEFAULT 1,
          target_role TEXT,
          target_agent_id TEXT,
          reason TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'scheduled',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (execution_id, reassignment_id),
          FOREIGN KEY (execution_id) REFERENCES orchestration_executions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_orchestration_execution_reassignments_lookup
          ON orchestration_execution_reassignments(execution_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS openclaw_sessions (
          session_id TEXT PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'idle',
          last_run_id TEXT,
          last_error TEXT NOT NULL DEFAULT '',
          cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
          run_count INTEGER NOT NULL DEFAULT 0,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_openclaw_sessions_updated
          ON openclaw_sessions(updated_at DESC);

        CREATE TABLE IF NOT EXISTS openclaw_runs (
          run_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'running',
          input_json TEXT NOT NULL DEFAULT '{}',
          output_json TEXT,
          error TEXT NOT NULL DEFAULT '',
          artifacts_json TEXT NOT NULL DEFAULT '[]',
          cost_json TEXT,
          parent_run_id TEXT,
          child_run_ids_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES openclaw_sessions(session_id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_openclaw_runs_session_updated
          ON openclaw_runs(session_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS openclaw_session_events (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          sequence BIGINT NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL DEFAULT '{}',
          event_ts TEXT NOT NULL,
          UNIQUE (session_id, sequence),
          FOREIGN KEY (session_id) REFERENCES openclaw_sessions(session_id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_openclaw_session_events_lookup
          ON openclaw_session_events(session_id, sequence ASC);

        CREATE TABLE IF NOT EXISTS openclaw_run_artifacts (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          artifact_type TEXT NOT NULL,
          content_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          FOREIGN KEY (run_id) REFERENCES openclaw_runs(run_id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_openclaw_run_artifacts_lookup
          ON openclaw_run_artifacts(run_id, created_at ASC);

        CREATE TABLE IF NOT EXISTS firewall_objects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          folder TEXT NOT NULL DEFAULT 'root',
          policy_text TEXT NOT NULL,
          scope TEXT NOT NULL DEFAULT 'global',
          assigned_agent_id TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          rules_count INTEGER NOT NULL DEFAULT 1,
          blocked_attempts INTEGER NOT NULL DEFAULT 0,
          archived BOOLEAN NOT NULL DEFAULT FALSE,
          last_evaluated_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_firewall_objects_lookup
          ON firewall_objects(archived, updated_at DESC);

        CREATE TABLE IF NOT EXISTS firewall_policy_revisions (
          id TEXT PRIMARY KEY,
          firewall_object_id TEXT NOT NULL,
          revision_no INTEGER NOT NULL,
          text TEXT NOT NULL,
          actor TEXT NOT NULL DEFAULT 'system',
          created_at TEXT NOT NULL,
          UNIQUE (firewall_object_id, revision_no),
          FOREIGN KEY (firewall_object_id) REFERENCES firewall_objects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_firewall_policy_revisions_lookup
          ON firewall_policy_revisions(firewall_object_id, revision_no DESC);

        CREATE TABLE IF NOT EXISTS firewall_object_snippets (
          id TEXT PRIMARY KEY,
          firewall_object_id TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'text',
          name TEXT NOT NULL,
          mime_type TEXT NOT NULL DEFAULT 'text/plain',
          size_bytes BIGINT NOT NULL DEFAULT 0,
          preview TEXT NOT NULL DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          added_at TEXT NOT NULL,
          FOREIGN KEY (firewall_object_id) REFERENCES firewall_objects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_firewall_object_snippets_lookup
          ON firewall_object_snippets(firewall_object_id, added_at DESC);

        CREATE TABLE IF NOT EXISTS skills_custom (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          file_name TEXT NOT NULL DEFAULT '',
          size_bytes BIGINT NOT NULL DEFAULT 0,
          imported_at TEXT NOT NULL,
          metadata_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_skills_custom_lookup
          ON skills_custom(imported_at DESC);

        CREATE TABLE IF NOT EXISTS skills_activity (
          id TEXT PRIMARY KEY,
          skill_id TEXT NOT NULL,
          skill_name TEXT NOT NULL,
          status TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          metadata_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_skills_activity_lookup
          ON skills_activity(timestamp DESC);

        CREATE TABLE IF NOT EXISTS chat_conversations (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL DEFAULT '',
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated
          ON chat_conversations(updated_at DESC);

        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          stream_state TEXT NOT NULL DEFAULT 'done',
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chat_messages_lookup
          ON chat_messages(conversation_id, created_at ASC);

        CREATE TABLE IF NOT EXISTS chat_stream_events (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          message_id TEXT,
          sequence BIGINT NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL DEFAULT '{}',
          event_ts TEXT NOT NULL,
          UNIQUE (conversation_id, sequence),
          FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chat_stream_events_lookup
          ON chat_stream_events(conversation_id, sequence ASC);
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
        await this.pool.query(`INSERT INTO users (id, username, normalized_username, email, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`, [id, username, normalizedUsername, input.email?.trim() || null, input.passwordHash, now, now]);
        return { id, username, email: input.email?.trim() || null, passwordHash: input.passwordHash, createdAt: now, updatedAt: now };
    }
    async syncUserPasswordByUsername(input) {
        const username = input.username.trim();
        const normalizedUsername = normalizeUsername(username);
        if (!normalizedUsername)
            throw new Error("Username is required.");
        const existing = await this.findUserByUsername(username);
        if (!existing)
            return this.createUser({ username, email: input.email, passwordHash: input.passwordHash });
        const now = new Date().toISOString();
        await this.pool.query(`UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`, [input.passwordHash, now, existing.id]);
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
        const result = await this.pool.query(`SELECT s.id, s.user_id, s.created_at, s.expires_at, s.revoked_at, u.username, u.email
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.revoked_at IS NULL AND s.expires_at > $2 LIMIT 1`, [sessionId, nowIso]);
        if (result.rows.length === 0)
            return undefined;
        const row = result.rows[0];
        return {
            id: row.id, userId: row.user_id, createdAt: row.created_at, expiresAt: row.expires_at, revokedAt: row.revoked_at,
            user: { id: row.user_id, username: row.username, email: row.email },
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
    // ── Tasks ────────────────────────────────────────────────────────────────
    async createTask(input) {
        const now = new Date().toISOString();
        const id = randomUUID();
        const schedule = input.schedule ?? {};
        await this.pool.query(
            `INSERT INTO tasks (
              id, title, prompt, status, schedule_json, assignment_json,
              created_by, last_run_at, next_run_at, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, $9)`,
            [
                id,
                input.title ?? "Untitled task",
                input.prompt ?? "",
                input.status ?? "queued",
                JSON.stringify(schedule),
                JSON.stringify(input.assignment ?? {}),
                input.createdBy ?? null,
                schedule.startAt ?? null,
                now,
            ]
        );
        return this.findTaskById(id);
    }
    async listTasks() {
        const result = await this.pool.query(
            `SELECT * FROM tasks ORDER BY updated_at DESC`
        );
        return result.rows.map(toTaskRecord);
    }
    async findTaskById(taskId) {
        const result = await this.pool.query(`SELECT * FROM tasks WHERE id = $1`, [taskId]);
        if (result.rows.length === 0) return undefined;
        return toTaskRecord(result.rows[0]);
    }
    async updateTask(taskId, updates = {}) {
        const sets = [];
        const params = [];
        let idx = 1;
        if (updates.title !== undefined) { sets.push(`title = $${idx++}`); params.push(updates.title); }
        if (updates.prompt !== undefined) { sets.push(`prompt = $${idx++}`); params.push(updates.prompt); }
        if (updates.status !== undefined) { sets.push(`status = $${idx++}`); params.push(updates.status); }
        if (updates.schedule !== undefined) { sets.push(`schedule_json = $${idx++}`); params.push(JSON.stringify(updates.schedule)); }
        if (updates.assignment !== undefined) { sets.push(`assignment_json = $${idx++}`); params.push(JSON.stringify(updates.assignment)); }
        if (updates.lastRunAt !== undefined) { sets.push(`last_run_at = $${idx++}`); params.push(updates.lastRunAt); }
        if (updates.nextRunAt !== undefined) { sets.push(`next_run_at = $${idx++}`); params.push(updates.nextRunAt); }
        if (sets.length === 0) return this.findTaskById(taskId);
        sets.push(`updated_at = $${idx++}`);
        params.push(new Date().toISOString());
        params.push(taskId);
        const result = await this.pool.query(
            `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${idx++} RETURNING *`,
            params
        );
        if (result.rows.length === 0) return undefined;
        return toTaskRecord(result.rows[0]);
    }
    async deleteTask(taskId) {
        await this.pool.query(`DELETE FROM tasks WHERE id = $1`, [taskId]);
    }
    async assignTask(taskId, assignment) {
        return this.updateTask(taskId, { assignment });
    }
    async pauseTask(taskId) {
        return this.updateTask(taskId, { status: "paused" });
    }
    async resumeTask(taskId) {
        return this.updateTask(taskId, { status: "running" });
    }
    async runTaskNow(taskId) {
        const now = new Date().toISOString();
        const current = await this.findTaskById(taskId);
        const schedule = current?.schedule ?? {};
        const intervalMinutes = Math.max(0, Number(schedule.intervalMinutes || 0));
        const nextRunAt = intervalMinutes > 0
            ? new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString()
            : now;
        return this.updateTask(taskId, {
            status: "running",
            lastRunAt: now,
            nextRunAt,
        });
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
    async listOrchestrationConversationMessages(orchestrationId) {
        const result = await this.pool.query(
            `SELECT * FROM orchestration_conversation_messages WHERE orchestration_id = $1 ORDER BY created_at ASC`,
            [orchestrationId]
        );
        return result.rows.map(toOrchestrationConversationRecord);
    }
    async createOrchestrationConversationMessage(input) {
        const now = new Date().toISOString();
        const id = input.id ?? randomUUID();
        const result = await this.pool.query(
            `INSERT INTO orchestration_conversation_messages (id, orchestration_id, role, text, metadata_json, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                id,
                input.orchestrationId,
                input.role ?? "user",
                input.text ?? "",
                JSON.stringify(input.metadata ?? {}),
                input.createdAt ?? now,
            ]
        );
        return toOrchestrationConversationRecord(result.rows[0]);
    }
    async listOrchestrationExecutionTasks(executionId) {
        const result = await this.pool.query(
            `SELECT * FROM orchestration_execution_tasks WHERE execution_id = $1 ORDER BY created_at ASC`,
            [executionId]
        );
        return result.rows.map(toOrchestrationExecutionTaskRecord);
    }
    async upsertOrchestrationExecutionTask(input) {
        const now = new Date().toISOString();
        const id = input.id ?? randomUUID();
        const taskId = input.taskId ?? id;
        const result = await this.pool.query(
            `INSERT INTO orchestration_execution_tasks
              (id, task_id, execution_id, node_id, title, status, owner_role, owner_agent_id, due_at, history_json, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
             ON CONFLICT (execution_id, task_id) DO UPDATE SET
               node_id = EXCLUDED.node_id,
               title = EXCLUDED.title,
               status = EXCLUDED.status,
               owner_role = EXCLUDED.owner_role,
               owner_agent_id = EXCLUDED.owner_agent_id,
               due_at = EXCLUDED.due_at,
               history_json = EXCLUDED.history_json,
               updated_at = EXCLUDED.updated_at
             RETURNING *`,
            [
                id,
                taskId,
                input.executionId,
                input.nodeId ?? "",
                input.title ?? "Task",
                input.status ?? "queued",
                input.ownerRole ?? "",
                input.ownerAgentId ?? null,
                input.dueAt ?? null,
                JSON.stringify(input.history ?? []),
                input.createdAt ?? now,
            ]
        );
        return toOrchestrationExecutionTaskRecord(result.rows[0]);
    }
    async listOrchestrationExecutionReassignments(executionId) {
        const result = await this.pool.query(
            `SELECT * FROM orchestration_execution_reassignments WHERE execution_id = $1 ORDER BY updated_at DESC`,
            [executionId]
        );
        return result.rows.map(toOrchestrationExecutionReassignmentRecord);
    }
    async createOrchestrationExecutionReassignment(input) {
        const now = new Date().toISOString();
        const id = input.id ?? randomUUID();
        const reassignmentId = input.reassignmentId ?? id;
        const result = await this.pool.query(
            `INSERT INTO orchestration_execution_reassignments
             (id, reassignment_id, execution_id, task_id, due_at, repeat_interval_minutes, max_repeats, target_role, target_agent_id, reason, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
             RETURNING *`,
            [
                id,
                reassignmentId,
                input.executionId,
                input.taskId,
                input.dueAt,
                Math.max(0, Number(input.repeatIntervalMinutes ?? 0)),
                Math.max(1, Number(input.maxRepeats ?? 1)),
                input.targetRole ?? null,
                input.targetAgentId ?? null,
                input.reason ?? "",
                input.status ?? "scheduled",
                input.createdAt ?? now,
            ]
        );
        return toOrchestrationExecutionReassignmentRecord(result.rows[0]);
    }
    async updateOrchestrationExecutionReassignmentStatus(executionId, reassignmentId, status) {
        const result = await this.pool.query(
            `UPDATE orchestration_execution_reassignments
             SET status = $3, updated_at = $4
             WHERE execution_id = $1 AND (id = $2 OR reassignment_id = $2)
             RETURNING *`,
            [executionId, reassignmentId, status, new Date().toISOString()]
        );
        if (result.rows.length === 0) return undefined;
        return toOrchestrationExecutionReassignmentRecord(result.rows[0]);
    }
    async upsertOpenClawSession(input) {
        const now = new Date().toISOString();
        const result = await this.pool.query(
            `INSERT INTO openclaw_sessions
              (session_id, status, last_run_id, last_error, cancel_requested, run_count, metadata_json, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
             ON CONFLICT (session_id) DO UPDATE SET
               status = EXCLUDED.status,
               last_run_id = EXCLUDED.last_run_id,
               last_error = EXCLUDED.last_error,
               cancel_requested = EXCLUDED.cancel_requested,
               run_count = EXCLUDED.run_count,
               metadata_json = EXCLUDED.metadata_json,
               updated_at = EXCLUDED.updated_at
             RETURNING *`,
            [
                input.sessionId,
                input.status ?? "idle",
                input.lastRunId ?? null,
                input.lastError ?? "",
                input.cancelRequested === true,
                Number(input.runCount ?? 0),
                JSON.stringify(input.metadata ?? {}),
                input.createdAt ?? now,
            ]
        );
        return toOpenClawSessionRecord(result.rows[0]);
    }
    async listOpenClawSessions(options = {}) {
        const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
        const offset = Math.max(Number(options.offset) || 0, 0);
        const result = await this.pool.query(
            `SELECT * FROM openclaw_sessions ORDER BY updated_at DESC LIMIT $1 OFFSET $2`,
            [limit, offset]
        );
        return result.rows.map(toOpenClawSessionRecord);
    }
    async findOpenClawSession(sessionId) {
        const result = await this.pool.query(`SELECT * FROM openclaw_sessions WHERE session_id = $1`, [sessionId]);
        if (result.rows.length === 0) return undefined;
        return toOpenClawSessionRecord(result.rows[0]);
    }
    async upsertOpenClawRun(input) {
        const now = new Date().toISOString();
        const result = await this.pool.query(
            `INSERT INTO openclaw_runs
              (run_id, session_id, type, status, input_json, output_json, error, artifacts_json, cost_json, parent_run_id, child_run_ids_json, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
             ON CONFLICT (run_id) DO UPDATE SET
               status = EXCLUDED.status,
               input_json = EXCLUDED.input_json,
               output_json = EXCLUDED.output_json,
               error = EXCLUDED.error,
               artifacts_json = EXCLUDED.artifacts_json,
               cost_json = EXCLUDED.cost_json,
               parent_run_id = EXCLUDED.parent_run_id,
               child_run_ids_json = EXCLUDED.child_run_ids_json,
               updated_at = EXCLUDED.updated_at
             RETURNING *`,
            [
                input.runId,
                input.sessionId,
                input.type ?? "turn",
                input.status ?? "running",
                JSON.stringify(input.input ?? {}),
                input.output == null ? null : JSON.stringify(input.output),
                input.error ?? "",
                JSON.stringify(input.artifacts ?? []),
                input.cost == null ? null : JSON.stringify(input.cost),
                input.parentRunId ?? null,
                JSON.stringify(input.childRunIds ?? []),
                input.createdAt ?? now,
            ]
        );
        return toOpenClawRunRecord(result.rows[0]);
    }
    async findOpenClawRun(runId) {
        const result = await this.pool.query(`SELECT * FROM openclaw_runs WHERE run_id = $1`, [runId]);
        if (result.rows.length === 0) return undefined;
        return toOpenClawRunRecord(result.rows[0]);
    }
    async listOpenClawRunsBySession(sessionId) {
        const result = await this.pool.query(
            `SELECT * FROM openclaw_runs WHERE session_id = $1 ORDER BY updated_at DESC`,
            [sessionId]
        );
        return result.rows.map(toOpenClawRunRecord);
    }
    async appendOpenClawSessionEvent(input) {
        const sequenceResult = await this.pool.query(
            `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
               FROM openclaw_session_events
              WHERE session_id = $1`,
            [input.sessionId]
        );
        const sequence = Number(sequenceResult.rows[0]?.next_sequence ?? 1);
        const eventId = input.id ?? `${input.sessionId}:${sequence}`;
        const result = await this.pool.query(
            `INSERT INTO openclaw_session_events (id, session_id, sequence, event_type, payload_json, event_ts)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (session_id, sequence) DO NOTHING
             RETURNING *`,
            [
                eventId,
                input.sessionId,
                sequence,
                input.eventType ?? "event",
                JSON.stringify(input.payload ?? {}),
                input.timestamp ?? new Date().toISOString(),
            ]
        );
        if (result.rows.length === 0) {
            const existing = await this.pool.query(
                `SELECT * FROM openclaw_session_events WHERE session_id = $1 AND sequence = $2 LIMIT 1`,
                [input.sessionId, sequence]
            );
            return existing.rows.length > 0 ? toOpenClawSessionEventRecord(existing.rows[0]) : undefined;
        }
        return toOpenClawSessionEventRecord(result.rows[0]);
    }
    async listOpenClawSessionEvents(sessionId, options = {}) {
        const afterSequence = Math.max(Number(options.afterSequence ?? 0), 0);
        const limit = Math.min(Math.max(Number(options.limit) || 300, 1), 2000);
        const result = await this.pool.query(
            `SELECT * FROM openclaw_session_events
             WHERE session_id = $1 AND sequence > $2
             ORDER BY sequence ASC
             LIMIT $3`,
            [sessionId, afterSequence, limit]
        );
        return result.rows.map(toOpenClawSessionEventRecord);
    }
    async replaceOpenClawRunArtifacts(runId, artifacts = []) {
        await this.pool.query(`DELETE FROM openclaw_run_artifacts WHERE run_id = $1`, [runId]);
        if (!Array.isArray(artifacts) || artifacts.length === 0) return 0;
        const cols = 5;
        const params = [];
        const placeholders = [];
        for (let i = 0; i < artifacts.length; i++) {
            const offset = i * cols;
            const artifact = artifacts[i] ?? {};
            placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
            params.push(
                randomUUID(),
                runId,
                artifact.artifactType ?? "artifact",
                JSON.stringify(artifact.content ?? artifact),
                artifact.createdAt ?? new Date().toISOString(),
            );
        }
        await this.pool.query(
            `INSERT INTO openclaw_run_artifacts (id, run_id, artifact_type, content_json, created_at) VALUES ${placeholders.join(",")}`,
            params
        );
        return artifacts.length;
    }
    async listOpenClawRunArtifacts(runId) {
        const result = await this.pool.query(
            `SELECT id, artifact_type, content_json, created_at FROM openclaw_run_artifacts WHERE run_id = $1 ORDER BY created_at ASC`,
            [runId]
        );
        return result.rows.map((row) => ({
            id: row.id,
            artifactType: row.artifact_type,
            content: parsePayload(row.content_json) ?? {},
            createdAt: row.created_at,
        }));
    }
    async createFirewallObject(input) {
        const now = new Date().toISOString();
        const id = input.id ?? randomUUID();
        const result = await this.pool.query(
            `INSERT INTO firewall_objects
              (id, name, folder, policy_text, scope, assigned_agent_id, status, rules_count, blocked_attempts, archived, last_evaluated_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, $10, $11, $11)
             RETURNING *`,
            [
                id,
                input.name,
                input.folder ?? "root",
                input.policyText ?? "",
                input.scope ?? "global",
                input.assignedAgentId ?? null,
                input.status ?? "active",
                Math.max(1, Number(input.rulesCount ?? 1)),
                Math.max(0, Number(input.blockedAttempts ?? 0)),
                input.lastEvaluatedAt ?? null,
                input.createdAt ?? now,
            ]
        );
        return toFirewallObjectRecord(result.rows[0]);
    }
    async listFirewallObjects(options = {}) {
        const archived = options.archived === true;
        const result = await this.pool.query(
            `SELECT * FROM firewall_objects WHERE archived = $1 ORDER BY updated_at DESC`,
            [archived]
        );
        return result.rows.map(toFirewallObjectRecord);
    }
    async findFirewallObject(id) {
        const result = await this.pool.query(`SELECT * FROM firewall_objects WHERE id = $1 LIMIT 1`, [id]);
        if (result.rows.length === 0) return undefined;
        return toFirewallObjectRecord(result.rows[0]);
    }
    async updateFirewallObject(id, updates = {}) {
        const sets = [];
        const params = [];
        let idx = 1;
        if (updates.name !== undefined) { sets.push(`name = $${idx++}`); params.push(updates.name); }
        if (updates.folder !== undefined) { sets.push(`folder = $${idx++}`); params.push(updates.folder); }
        if (updates.policyText !== undefined) { sets.push(`policy_text = $${idx++}`); params.push(updates.policyText); }
        if (updates.scope !== undefined) { sets.push(`scope = $${idx++}`); params.push(updates.scope); }
        if (updates.assignedAgentId !== undefined) { sets.push(`assigned_agent_id = $${idx++}`); params.push(updates.assignedAgentId); }
        if (updates.status !== undefined) { sets.push(`status = $${idx++}`); params.push(updates.status); }
        if (updates.rulesCount !== undefined) { sets.push(`rules_count = $${idx++}`); params.push(Math.max(1, Number(updates.rulesCount))); }
        if (updates.blockedAttempts !== undefined) { sets.push(`blocked_attempts = $${idx++}`); params.push(Math.max(0, Number(updates.blockedAttempts))); }
        if (updates.archived !== undefined) { sets.push(`archived = $${idx++}`); params.push(Boolean(updates.archived)); }
        if (updates.lastEvaluatedAt !== undefined) { sets.push(`last_evaluated_at = $${idx++}`); params.push(updates.lastEvaluatedAt); }
        if (sets.length === 0) return this.findFirewallObject(id);
        sets.push(`updated_at = $${idx++}`);
        params.push(new Date().toISOString());
        params.push(id);
        const result = await this.pool.query(`UPDATE firewall_objects SET ${sets.join(", ")} WHERE id = $${idx++} RETURNING *`, params);
        if (result.rows.length === 0) return undefined;
        return toFirewallObjectRecord(result.rows[0]);
    }
    async createFirewallPolicyRevision(input) {
        const nextRevisionResult = await this.pool.query(
            `SELECT COALESCE(MAX(revision_no), 0) + 1 AS revision_no
               FROM firewall_policy_revisions
              WHERE firewall_object_id = $1`,
            [input.firewallObjectId]
        );
        const revisionNo = Number(nextRevisionResult.rows[0]?.revision_no ?? 1);
        const result = await this.pool.query(
            `INSERT INTO firewall_policy_revisions (id, firewall_object_id, revision_no, text, actor, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                input.id ?? randomUUID(),
                input.firewallObjectId,
                revisionNo,
                input.text ?? "",
                input.actor ?? "system",
                input.createdAt ?? new Date().toISOString(),
            ]
        );
        return {
            id: result.rows[0].id,
            revisionNo: Number(result.rows[0].revision_no ?? 1),
            text: result.rows[0].text,
            actor: result.rows[0].actor,
            timestamp: result.rows[0].created_at,
        };
    }
    async listFirewallPolicyRevisions(firewallObjectId) {
        const result = await this.pool.query(
            `SELECT id, revision_no, text, actor, created_at FROM firewall_policy_revisions
             WHERE firewall_object_id = $1 ORDER BY revision_no DESC`,
            [firewallObjectId]
        );
        return result.rows.map((row) => ({
            id: row.id,
            revisionNo: Number(row.revision_no ?? 1),
            text: row.text,
            actor: row.actor,
            timestamp: row.created_at,
        }));
    }
    async createFirewallSnippet(input) {
        const result = await this.pool.query(
            `INSERT INTO firewall_object_snippets
             (id, firewall_object_id, kind, name, mime_type, size_bytes, preview, content, added_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                input.id ?? randomUUID(),
                input.firewallObjectId,
                input.kind ?? "text",
                input.name ?? "snippet.txt",
                input.mimeType ?? "text/plain",
                Number(input.sizeBytes ?? 0),
                input.preview ?? "",
                input.content ?? "",
                input.addedAt ?? new Date().toISOString(),
            ]
        );
        return toFirewallSnippetRecord(result.rows[0]);
    }
    async listFirewallSnippets(firewallObjectId) {
        const result = await this.pool.query(
            `SELECT * FROM firewall_object_snippets WHERE firewall_object_id = $1 ORDER BY added_at DESC`,
            [firewallObjectId]
        );
        return result.rows.map(toFirewallSnippetRecord);
    }
    async deleteFirewallSnippet(firewallObjectId, snippetId) {
        await this.pool.query(
            `DELETE FROM firewall_object_snippets WHERE firewall_object_id = $1 AND id = $2`,
            [firewallObjectId, snippetId]
        );
    }
    async listCustomSkills() {
        const result = await this.pool.query(`SELECT * FROM skills_custom ORDER BY imported_at DESC`);
        return result.rows.map(toSkillCustomRecord);
    }
    async createCustomSkill(input) {
        const result = await this.pool.query(
            `INSERT INTO skills_custom
             (id, name, description, file_name, size_bytes, imported_at, metadata_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                input.id ?? randomUUID(),
                input.name,
                input.description ?? "",
                input.fileName ?? "",
                Number(input.sizeBytes ?? 0),
                input.importedAt ?? new Date().toISOString(),
                JSON.stringify(input.metadata ?? {}),
            ]
        );
        return toSkillCustomRecord(result.rows[0]);
    }
    async deleteCustomSkill(id) {
        await this.pool.query(`DELETE FROM skills_custom WHERE id = $1`, [id]);
    }
    async listSkillsActivity(limit = 50) {
        const bounded = Math.min(Math.max(Number(limit) || 50, 1), 500);
        const result = await this.pool.query(`SELECT * FROM skills_activity ORDER BY timestamp DESC LIMIT $1`, [bounded]);
        return result.rows.map(toSkillActivityRecord);
    }
    async createSkillsActivity(input) {
        const result = await this.pool.query(
            `INSERT INTO skills_activity (id, skill_id, skill_name, status, timestamp, metadata_json)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                input.id ?? randomUUID(),
                input.skillId,
                input.skillName,
                input.status ?? "success",
                input.timestamp ?? new Date().toISOString(),
                JSON.stringify(input.metadata ?? {}),
            ]
        );
        return toSkillActivityRecord(result.rows[0]);
    }
    async ensureChatConversation(id, input = {}) {
        const now = new Date().toISOString();
        const result = await this.pool.query(
            `INSERT INTO chat_conversations (id, title, metadata_json, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $4)
             ON CONFLICT (id) DO UPDATE SET
               title = COALESCE(NULLIF(EXCLUDED.title, ''), chat_conversations.title),
               metadata_json = EXCLUDED.metadata_json,
               updated_at = EXCLUDED.updated_at
             RETURNING *`,
            [id, input.title ?? "", JSON.stringify(input.metadata ?? {}), now]
        );
        return toChatConversationRecord(result.rows[0]);
    }
    async listChatConversations(limit = 50) {
        const bounded = Math.min(Math.max(Number(limit) || 50, 1), 500);
        const result = await this.pool.query(`SELECT * FROM chat_conversations ORDER BY updated_at DESC LIMIT $1`, [bounded]);
        return result.rows.map(toChatConversationRecord);
    }
    async listChatMessages(conversationId) {
        const result = await this.pool.query(
            `SELECT * FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
            [conversationId]
        );
        return result.rows.map(toChatMessageRecord);
    }
    async createChatMessage(input) {
        const now = new Date().toISOString();
        const result = await this.pool.query(
            `INSERT INTO chat_messages
             (id, conversation_id, role, content, stream_state, metadata_json, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
             RETURNING *`,
            [
                input.id ?? randomUUID(),
                input.conversationId,
                input.role ?? "user",
                input.content ?? "",
                input.streamState ?? "done",
                JSON.stringify(input.metadata ?? {}),
                input.createdAt ?? now,
            ]
        );
        return toChatMessageRecord(result.rows[0]);
    }
    async updateChatMessage(id, updates = {}) {
        const sets = [];
        const params = [];
        let idx = 1;
        if (updates.content !== undefined) { sets.push(`content = $${idx++}`); params.push(updates.content); }
        if (updates.streamState !== undefined) { sets.push(`stream_state = $${idx++}`); params.push(updates.streamState); }
        if (updates.metadata !== undefined) { sets.push(`metadata_json = $${idx++}`); params.push(JSON.stringify(updates.metadata)); }
        if (sets.length === 0) return undefined;
        sets.push(`updated_at = $${idx++}`);
        params.push(new Date().toISOString());
        params.push(id);
        const result = await this.pool.query(
            `UPDATE chat_messages SET ${sets.join(", ")} WHERE id = $${idx++} RETURNING *`,
            params
        );
        if (result.rows.length === 0) return undefined;
        return toChatMessageRecord(result.rows[0]);
    }
    async appendChatStreamEvent(input) {
        const sequenceResult = await this.pool.query(
            `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
               FROM chat_stream_events
              WHERE conversation_id = $1`,
            [input.conversationId]
        );
        const sequence = Number(sequenceResult.rows[0]?.next_sequence ?? 1);
        await this.pool.query(
            `INSERT INTO chat_stream_events (id, conversation_id, message_id, sequence, event_type, payload_json, event_ts)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (conversation_id, sequence) DO NOTHING`,
            [
                input.id ?? randomUUID(),
                input.conversationId,
                input.messageId ?? null,
                sequence,
                input.eventType ?? "chunk",
                JSON.stringify(input.payload ?? {}),
                input.timestamp ?? new Date().toISOString(),
            ]
        );
        return sequence;
    }
    async close() {
        await this.pool.end();
    }
}
//# sourceMappingURL=pg-db.js.map
