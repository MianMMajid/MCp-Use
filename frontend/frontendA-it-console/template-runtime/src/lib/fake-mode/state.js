const DAY_MS = 24 * 60 * 60 * 1000

function hashSeed(input) {
  const text = String(input || 'maple-seed')
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)
  }
  return h >>> 0
}

function mulberry32(a) {
  let t = a >>> 0
  return function next() {
    t += 0x6d2b79f5
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function makeIdFactory() {
  // Start counters above seeded IDs to prevent collisions.
  // Seeded state uses IDs like uak-1, uak-2, so start counters at 100.
  const counters = new Map()
  const SEED_OFFSET = 100
  return function nextId(prefix) {
    const next = (counters.get(prefix) || SEED_OFFSET) + 1
    counters.set(prefix, next)
    return `${prefix}-${next}`
  }
}

function pick(rand, items) {
  return items[Math.floor(rand() * items.length)]
}

function buildAgents(rand, now, nextId) {
  const models = ['gpt-4.1', 'gpt-4o-mini', 'o3-mini']
  const names = [
    'Policy Sentinel',
    'Ops Triage',
    'Escalation Analyst',
    'Trace Curator',
    'Risk Reviewer',
    'Cost Watcher',
  ]
  return names.map((name, idx) => ({
    id: `agent-${idx + 1}`,
    agentId: `agent-${idx + 1}`,
    name,
    description: `${name} agent for simulated workflows`,
    status: pick(rand, ['active', 'active', 'idle']),
    riskTier: pick(rand, ['low', 'medium', 'high']),
    riskScore: Math.round(rand() * 100),
    model: pick(rand, models),
    pinned: idx < 4,
    createdAt: new Date(now - (idx + 1) * DAY_MS).toISOString(),
    updatedAt: new Date(now - idx * 2 * 60 * 60 * 1000).toISOString(),
    capabilities: ['chat', 'tool_use', 'orchestration'],
    tags: ['fake', 'seeded'],
    version: `v${1 + idx}`,
    metadata: { owner: 'fake-mode', environment: 'local' },
  }))
}

function buildApprovals(now) {
  return [
    {
      approvalId: 'approval-1',
      traceId: 'trace-1001',
      stepIndex: 0,
      toolName: 'delete_record',
      action: 'delete_record',
      risk: 'high',
      description: 'Delete a production record requested by an automation.',
      status: 'pending',
      createdAt: new Date(now - 5 * 60 * 1000).toISOString(),
      user: 'ops@mayple.dev',
      requiresStepUp: true,
    },
    {
      approvalId: 'approval-2',
      traceId: 'trace-1002',
      stepIndex: 1,
      toolName: 'grant_role',
      action: 'grant_role',
      risk: 'medium',
      description: 'Grant elevated role to service account.',
      status: 'pending',
      createdAt: new Date(now - 2 * 60 * 1000).toISOString(),
      user: 'secops@mayple.dev',
      requiresStepUp: false,
    },
  ]
}

function buildRuns(now, rand, nextId) {
  const statuses = ['running', 'completed', 'failed', 'completed', 'queued']
  const types = ['turn', 'longform', 'orchestration']
  const runs = []
  for (let i = 0; i < 10; i += 1) {
    const runId = `run-${1000 + i}`
    const status = statuses[i % statuses.length]
    const createdAt = new Date(now - (i + 1) * 15 * 60 * 1000).toISOString()
    const updatedAt = new Date(now - i * 10 * 60 * 1000).toISOString()
    runs.push({
      runId,
      id: runId,
      type: types[i % types.length],
      status,
      createdAt,
      startedAt: createdAt,
      updatedAt,
      completedAt: status === 'completed' || status === 'failed' ? updatedAt : null,
      duration: `${30 + i * 3}s`,
      agentName: `Agent ${(i % 4) + 1}`,
      agent: `agent-${(i % 4) + 1}`,
      sessionId: `session-${(i % 5) + 1}`,
      cost: { estimatedCostUsd: Number((rand() * 0.1 + 0.01).toFixed(4)) },
      input: { message: `Input message ${i + 1}` },
      output: { reply: `Generated reply ${i + 1}` },
      timeline: [
        { id: nextId('event'), eventType: 'queued', type: 'queued', timestamp: createdAt, message: 'Run queued' },
        { id: nextId('event'), eventType: status === 'failed' ? 'error' : 'completed', type: status === 'failed' ? 'error' : 'completed', timestamp: updatedAt, message: status === 'failed' ? 'Run failed' : 'Run completed' },
      ],
      children: [],
      artifacts: [
        { id: nextId('artifact'), name: `artifact-${i + 1}.json`, type: 'json', size: `${2 + i}KB` },
      ],
    })
  }

  runs[1].childRunIds = [runs[3].runId]
  runs[3].parentRunId = runs[1].runId
  runs[1].children = [{ runId: runs[3].runId, status: runs[3].status, type: runs[3].type }]

  return runs
}

function buildSessions(now, runs) {
  const sessions = []
  for (let i = 0; i < 6; i += 1) {
    const sessionId = `session-${i + 1}`
    const sessionRuns = runs.filter((r) => r.sessionId === sessionId).map((run) => ({
      runId: run.runId,
      status: run.status,
      type: run.type,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      cost: run.cost,
      parentRunId: run.parentRunId || null,
      childRunIds: run.childRunIds || [],
    }))
    sessions.push({
      sessionId,
      id: sessionId,
      title: `Session ${i + 1}`,
      status: i % 3 === 0 ? 'running' : 'completed',
      startedAt: new Date(now - (i + 1) * 2 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(now - (i + 1) * 2 * 60 * 60 * 1000).toISOString(),
      completedAt: i % 3 === 0 ? null : new Date(now - i * 60 * 60 * 1000).toISOString(),
      agentName: `Agent ${(i % 4) + 1}`,
      agent: `agent-${(i % 4) + 1}`,
      runs: sessionRuns,
      events: [],
    })
  }
  return sessions
}

function buildOrchestrations(now, nextId) {
  const oneId = 'orch-1'
  const twoId = 'orch-2'
  return [
    {
      id: oneId,
      orchestrationId: oneId,
      name: 'Incident Containment Flow',
      description: 'Contain, escalate, and audit risky actions.',
      status: 'active',
      createdAt: new Date(now - 8 * DAY_MS).toISOString(),
      updatedAt: new Date(now - 15 * 60 * 1000).toISOString(),
      nodes: [
        { id: 'node-a', agentId: 'agent-1', label: 'Detect', position: { x: 120, y: 140 }, config: { maxRetries: 1 } },
        { id: 'node-b', agentId: 'agent-2', label: 'Review', position: { x: 360, y: 140 }, config: { maxRetries: 2 } },
        { id: 'node-c', agentId: 'agent-3', label: 'Escalate', position: { x: 600, y: 140 }, config: { maxRetries: 1 } },
      ],
      edges: [
        { id: 'edge-a-b', source: 'node-a', target: 'node-b', delegationPolicy: { riskCeiling: 'medium', requiresApproval: true } },
        { id: 'edge-b-c', source: 'node-b', target: 'node-c', delegationPolicy: { riskCeiling: 'high', requiresApproval: true } },
      ],
      publishedVersion: 'v3',
      versions: ['v1', 'v2', 'v3'],
    },
    {
      id: twoId,
      orchestrationId: twoId,
      name: 'Daily Governance Sweep',
      description: 'Scan, summarize, and notify.',
      status: 'draft',
      createdAt: new Date(now - 4 * DAY_MS).toISOString(),
      updatedAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      nodes: [
        { id: 'node-d', agentId: 'agent-4', label: 'Collect', position: { x: 120, y: 220 }, config: { maxRetries: 1 } },
        { id: 'node-e', agentId: 'agent-5', label: 'Summarize', position: { x: 360, y: 220 }, config: { maxRetries: 1 } },
      ],
      edges: [
        { id: 'edge-d-e', source: 'node-d', target: 'node-e', delegationPolicy: { riskCeiling: 'low', requiresApproval: false } },
      ],
      publishedVersion: 'v1',
      versions: ['v1'],
    },
  ]
}

function buildExecutions(now, orchestrations, nextId) {
  const items = []
  const statuses = ['running', 'completed', 'failed', 'waiting_approval']
  orchestrations.forEach((orch, idx) => {
    for (let i = 0; i < 3; i += 1) {
      const executionId = `exec-${idx + 1}-${i + 1}`
      const status = statuses[(idx + i) % statuses.length]
      const createdAt = new Date(now - (idx * 6 + i + 1) * 20 * 60 * 1000).toISOString()
      const updatedAt = new Date(now - (idx * 3 + i) * 10 * 60 * 1000).toISOString()
      const graphNodes = orch.nodes.map((node, nodeIdx) => ({
        id: node.id,
        label: node.label,
        agentId: node.agentId,
        status: status === 'failed' && nodeIdx === orch.nodes.length - 1 ? 'failed' : status === 'running' ? (nodeIdx === 0 ? 'running' : 'pending') : 'completed',
      }))
      const timeline = [
        { id: nextId('timeline'), eventType: 'execution.started', timestamp: createdAt, message: 'Execution started' },
        { id: nextId('timeline'), eventType: status === 'failed' ? 'execution.failed' : status === 'running' ? 'execution.running' : status === 'waiting_approval' ? 'execution.waiting_approval' : 'execution.completed', timestamp: updatedAt, message: `Execution ${status}` },
      ]
      const approvals = status === 'waiting_approval' ? [{ approvalId: `orch-approval-${executionId}`, toolName: 'delete_record', reason: 'High-risk tool', status: 'pending' }] : []
      items.push({
        executionId,
        id: executionId,
        orchestrationId: orch.id,
        status,
        mode: i % 2 === 0 ? 'live' : 'dry_run',
        requestedBy: 'fake-mode',
        createdAt,
        startedAt: createdAt,
        updatedAt,
        completedAt: status === 'completed' || status === 'failed' || status === 'canceled' ? updatedAt : null,
        graph: {
          nodes: graphNodes,
          edges: orch.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, status: 'active' })),
          approvals,
        },
        timeline,
        mutations: [],
      })
    }
  })
  return items
}

function buildNotifications(now, nextId) {
  return [
    { id: nextId('notif'), title: 'Approval required', message: 'A high-risk modifier action needs review.', body: 'A high-risk modifier action needs review.', type: 'approvals', category: 'approvals', read: false, createdAt: new Date(now - 4 * 60 * 1000).toISOString() },
    { id: nextId('notif'), title: 'Run failed', message: 'Run run-1004 failed and needs retry.', body: 'Run run-1004 failed and needs retry.', type: 'run_failures', category: 'run_failures', read: false, createdAt: new Date(now - 20 * 60 * 1000).toISOString() },
    { id: nextId('notif'), title: 'SLO warning', message: 'P95 latency crossed threshold.', body: 'P95 latency crossed threshold.', type: 'system_alerts', category: 'system_alerts', read: true, createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString() },
  ]
}

function buildObservability(now, nextId) {
  const auditLog = []
  for (let i = 0; i < 120; i += 1) {
    auditLog.push({
      id: nextId('audit'),
      event: i % 5 === 0 ? 'modifier.approved' : 'run.completed',
      actor: i % 2 === 0 ? 'agent-1' : 'ops@mayple.dev',
      timestamp: new Date(now - i * 3 * 60 * 1000).toISOString(),
      traceId: `trace-${1000 + i}`,
      status: i % 7 === 0 ? 'warning' : 'ok',
    })
  }
  const deadLetter = []
  for (let i = 0; i < 8; i += 1) {
    deadLetter.push({ id: nextId('dlq'), eventId: `dead-${i + 1}`, status: 'failed', reason: 'Downstream timeout', timestamp: new Date(now - i * 40 * 60 * 1000).toISOString() })
  }

  return {
    summary: {
      totalRuns: 224,
      failedRuns: 12,
      pendingApprovals: 3,
      avgLatencyMs: 432,
      errorRate: 0.03,
    },
    slo: {
      availability: 99.93,
      p95LatencyMs: 820,
      p99LatencyMs: 1350,
      burnRate: 0.61,
      status: 'healthy',
    },
    auditLog,
    auditChain: auditLog.slice(0, 40),
    deadLetter,
    retentionDays: 30,
    webhooks: [
      { id: 'wh-1', url: 'https://example.com/hook/alerts', events: ['alert.*'], active: true, createdAt: new Date(now - 8 * DAY_MS).toISOString() },
    ],
    webhookDeliveries: {
      'wh-1': [
        { id: nextId('delivery'), status: 'success', timestamp: new Date(now - 15 * 60 * 1000).toISOString(), eventType: 'alert.warning' },
        { id: nextId('delivery'), status: 'success', timestamp: new Date(now - 45 * 60 * 1000).toISOString(), eventType: 'alert.error' },
      ],
    },
  }
}

function buildTools(now) {
  return {
    registry: [
      { id: 'tool-1', toolId: 'tool-1', name: 'fetch_context', description: 'Fetch context wall data', createdAt: new Date(now - 10 * DAY_MS).toISOString() },
      { id: 'tool-2', toolId: 'tool-2', name: 'risk_score', description: 'Calculate risk score', createdAt: new Date(now - 6 * DAY_MS).toISOString() },
    ],
    policies: [
      { policyId: 'policy-1', name: 'block-delete', effect: 'deny', condition: 'tool == delete_record' },
      { policyId: 'policy-2', name: 'allow-read', effect: 'allow', condition: 'tool == read_record' },
    ],
    executions: [
      { id: 'exec-tool-1', executionId: 'exec-tool-1', toolName: 'fetch_context', status: 'completed', createdAt: new Date(now - 90 * 60 * 1000).toISOString(), output: { ok: true } },
      { id: 'exec-tool-2', executionId: 'exec-tool-2', toolName: 'risk_score', status: 'failed', createdAt: new Date(now - 50 * 60 * 1000).toISOString(), error: 'Threshold exceeded' },
    ],
    cliTools: ['trace-list', 'firewall-preview', 'policy-validate'],
    cliCatalog: [
      { name: 'trace-list', description: 'List recent traces' },
      { name: 'firewall-preview', description: 'Preview firewall decision' },
      { name: 'policy-validate', description: 'Validate policy draft' },
    ],
  }
}

function buildOrgData(now, nextId) {
  const orgs = [
    {
      id: 'org-1',
      orgId: 'org-1',
      name: 'Mayple Labs',
      plan: 'enterprise',
      status: 'active',
      memberCount: 3,
      createdAt: new Date(now - 100 * DAY_MS).toISOString(),
    },
    {
      id: 'org-2',
      orgId: 'org-2',
      name: 'Catalyst Team',
      plan: 'pro',
      status: 'active',
      memberCount: 2,
      createdAt: new Date(now - 30 * DAY_MS).toISOString(),
    },
  ]

  const membersByOrg = {
    'org-1': [
      { id: 'm-1', userId: 'user-1', email: 'demo@mayple.dev', username: 'demo', role: 'owner' },
      { id: 'm-2', userId: 'user-2', email: 'ops@mayple.dev', username: 'ops', role: 'admin' },
      { id: 'm-3', userId: 'user-3', email: 'secops@mayple.dev', username: 'secops', role: 'reviewer' },
    ],
    'org-2': [
      { id: 'm-4', userId: 'user-4', email: 'lead@catalyst.dev', username: 'lead', role: 'owner' },
      { id: 'm-5', userId: 'user-5', email: 'eng@catalyst.dev', username: 'eng', role: 'member' },
    ],
  }

  const rolesByOrg = {
    'org-1': [
      { id: 'role-owner', roleId: 'role-owner', name: 'owner', description: 'Full access' },
      { id: 'role-admin', roleId: 'role-admin', name: 'admin', description: 'Administrative access' },
      { id: 'role-reviewer', roleId: 'role-reviewer', name: 'reviewer', description: 'Approval reviewer' },
    ],
    'org-2': [
      { id: 'role-owner', roleId: 'role-owner', name: 'owner', description: 'Full access' },
      { id: 'role-member', roleId: 'role-member', name: 'member', description: 'Standard access' },
    ],
  }

  const invitesByOrg = {
    'org-1': [
      { id: 'invite-1', inviteId: 'invite-1', email: 'new.user@mayple.dev', status: 'pending', createdAt: new Date(now - 4 * DAY_MS).toISOString() },
    ],
    'org-2': [],
  }

  const serviceAccountsByOrg = {
    default: [
      { id: 'sa-1', name: 'ci-bot', description: 'CI pipeline bot', createdAt: new Date(now - 20 * DAY_MS).toISOString(), keyCount: 1 },
      { id: 'sa-2', name: 'audit-exporter', description: 'Exports audit logs', createdAt: new Date(now - 12 * DAY_MS).toISOString(), keyCount: 2 },
    ],
    'org-1': [
      { id: 'sa-1', name: 'ci-bot', description: 'CI pipeline bot', createdAt: new Date(now - 20 * DAY_MS).toISOString(), keyCount: 1 },
      { id: 'sa-2', name: 'audit-exporter', description: 'Exports audit logs', createdAt: new Date(now - 12 * DAY_MS).toISOString(), keyCount: 2 },
    ],
    'org-2': [
      { id: 'sa-3', name: 'ops-robot', description: 'Ops automation', createdAt: new Date(now - 8 * DAY_MS).toISOString(), keyCount: 1 },
    ],
  }

  const serviceAccountKeys = {
    'org-1': {
      'sa-1': [
        { id: 'sak-1', keyId: 'sak-1', createdAt: new Date(now - 15 * DAY_MS).toISOString() },
      ],
      'sa-2': [
        { id: 'sak-2', keyId: 'sak-2', createdAt: new Date(now - 11 * DAY_MS).toISOString() },
        { id: 'sak-3', keyId: 'sak-3', createdAt: new Date(now - 2 * DAY_MS).toISOString() },
      ],
    },
    'org-2': {
      'sa-3': [
        { id: 'sak-4', keyId: 'sak-4', createdAt: new Date(now - 7 * DAY_MS).toISOString() },
      ],
    },
    default: {
      'sa-1': [
        { id: 'sak-1', keyId: 'sak-1', createdAt: new Date(now - 15 * DAY_MS).toISOString() },
      ],
      'sa-2': [
        { id: 'sak-2', keyId: 'sak-2', createdAt: new Date(now - 11 * DAY_MS).toISOString() },
        { id: 'sak-3', keyId: 'sak-3', createdAt: new Date(now - 2 * DAY_MS).toISOString() },
      ],
    },
  }

  return {
    orgs,
    membersByOrg,
    rolesByOrg,
    invitesByOrg,
    serviceAccountsByOrg,
    serviceAccountKeys,
  }
}

export function createFakeState(seedInput) {
  const seed = String(seedInput || Date.now())
  const rand = mulberry32(hashSeed(seed))
  const nextId = makeIdFactory()
  const now = Date.now()

  const agents = buildAgents(rand, now, nextId)
  const runs = buildRuns(now, rand, nextId)
  const sessions = buildSessions(now, runs)
  const orgData = buildOrgData(now, nextId)
  const orchestrations = buildOrchestrations(now, nextId)
  const executions = buildExecutions(now, orchestrations, nextId)

  const state = {
    seed,
    now,
    sessionActive: false,
    user: {
      id: 'user-1',
      username: 'demo',
      email: 'demo@mayple.dev',
      createdAt: new Date(now - 120 * DAY_MS).toISOString(),
      role: 'owner',
    },
    subscription: {
      plan: 'enterprise',
      status: 'active',
      currentPeriodEnd: new Date(now + 27 * DAY_MS).toISOString(),
    },
    usage: {
      summary: {
        requests: 18234,
        tokensUsed: 912345,
        runs: 224,
        costUsd: 231.12,
      },
      timeseries: {
        '1h': { points: Array.from({ length: 12 }).map((_, i) => ({ t: i * 5, requests: Math.round(20 + rand() * 40), tokens: Math.round(1500 + rand() * 4000) })) },
        '6h': { points: Array.from({ length: 18 }).map((_, i) => ({ t: i * 20, requests: Math.round(80 + rand() * 120), tokens: Math.round(5000 + rand() * 7000) })) },
        '24h': { points: Array.from({ length: 24 }).map((_, i) => ({ t: i, requests: Math.round(140 + rand() * 220), tokens: Math.round(8000 + rand() * 12000) })) },
        '7d': { points: Array.from({ length: 14 }).map((_, i) => ({ t: i * 12, requests: Math.round(500 + rand() * 900), tokens: Math.round(30000 + rand() * 45000) })) },
        '30d': { points: Array.from({ length: 30 }).map((_, i) => ({ t: i, requests: Math.round(600 + rand() * 1000), tokens: Math.round(40000 + rand() * 60000) })) },
      },
      entitlements: {
        allowLongform: true,
        allowOrchestration: true,
        maxAgents: 25,
        maxSeats: 100,
      },
      limits: {
        requestsPerMinute: 1200,
        tokensPerMinute: 400000,
        maxConcurrentRuns: 40,
      },
    },
    invoices: Array.from({ length: 6 }).map((_, i) => ({
      id: `inv-${i + 1}`,
      invoiceId: `inv-${i + 1}`,
      amountUsd: Number((80 + rand() * 240).toFixed(2)),
      status: i === 0 ? 'open' : 'paid',
      periodStart: new Date(now - (i + 1) * 30 * DAY_MS).toISOString(),
      createdAt: new Date(now - (i + 1) * 25 * DAY_MS).toISOString(),
      dueAt: new Date(now - (i + 1) * 20 * DAY_MS).toISOString(),
      url: 'https://billing.example.com/invoice',
    })),
    notifications: buildNotifications(now, nextId),
    notificationPreferences: {
      categories: {
        approvals: true,
        escalations: true,
        run_failures: true,
        system_alerts: true,
      },
      channels: {
        email: true,
        in_app: true,
      },
    },
    firewall: {
      ok: true,
      mode: 'enforcing',
      status: 'online',
      rules: [
        { id: 'rule-1', name: 'Block destructive writes', action: 'block', priority: 10, description: 'Block high-risk delete/update operations without approval', pattern: 'tool in [delete_record, drop_table]' },
        { id: 'rule-2', name: 'Allow reads', action: 'allow', priority: 50, description: 'Allow low-risk read operations', pattern: 'tool in [read_record, list_records]' },
        { id: 'rule-3', name: 'Escalate secrets', action: 'review', priority: 20, description: 'Require HITL for secret operations', pattern: 'tool contains secrets' },
      ],
      capabilities: {
        streamingChat: { enabled: true, reason: 'enabled in fake mode' },
        policyPreview: { enabled: true, reason: 'enabled in fake mode' },
        hitl: { enabled: true, reason: 'enabled in fake mode' },
      },
      chatCapabilities: {
        models: ['gpt-4.1', 'gpt-4o-mini'],
        supportsStreaming: true,
      },
    },
    downstream: {
      apps: [
        { appId: 'github', id: 'github', name: 'GitHub', status: 'connected' },
        { appId: 'slack', id: 'slack', name: 'Slack', status: 'connected' },
      ],
      tools: [
        { toolId: 'github.search_prs', app: 'github', name: 'search_prs' },
        { toolId: 'slack.post_message', app: 'slack', name: 'post_message' },
      ],
    },
    community: {
      stats: { sharedTraces: 184, collaborators: 29, weeklyGrowthPct: 8.2 },
      traces: [
        { id: 'comm-trace-1', traceId: 'comm-trace-1', title: 'Privilege escalation blocked', status: 'shared', createdAt: new Date(now - 2 * DAY_MS).toISOString() },
        { id: 'comm-trace-2', traceId: 'comm-trace-2', title: 'Policy tuning review', status: 'shared', createdAt: new Date(now - DAY_MS).toISOString() },
      ],
    },
    integrations: {
      catalog: [
        { id: 'github', provider: 'github', name: 'GitHub', category: 'source-control', description: 'Repository and PR workflows', status: 'available' },
        { id: 'slack', provider: 'slack', name: 'Slack', category: 'messaging', description: 'Chat notifications and approvals', status: 'available' },
        { id: 'jira', provider: 'jira', name: 'Jira', category: 'ticketing', description: 'Incident ticket orchestration', status: 'available' },
      ],
      connected: [
        { id: 'github', provider: 'github', name: 'GitHub', status: 'connected' },
        { id: 'slack', provider: 'slack', name: 'Slack', status: 'active' },
      ],
    },
    org: orgData,
    userApiKeys: [
      { id: 'uak-1', keyId: 'uak-1', name: 'automation-key', fingerprint: 'mpk_47a1', createdAt: new Date(now - 14 * DAY_MS).toISOString(), expiresAt: new Date(now + 60 * DAY_MS).toISOString() },
      { id: 'uak-2', keyId: 'uak-2', name: 'analyst-key', fingerprint: 'mpk_8bc2', createdAt: new Date(now - 6 * DAY_MS).toISOString(), expiresAt: null },
    ],
    agents,
    runs,
    sessions,
    hitl: {
      adminApprovals: buildApprovals(now),
      gatewayApprovals: buildApprovals(now).map((a, idx) => ({ ...a, approvalId: `gw-${idx + 1}` })),
      modifierApprovals: buildApprovals(now).map((a, idx) => ({ ...a, approvalId: `mod-${idx + 1}` })),
    },
    operations: {
      escalation: [
        { id: 'esc-1', approvalId: 'approval-1', status: 'pending', createdAt: new Date(now - 20 * 60 * 1000).toISOString() },
      ],
      breakGlass: [
        { id: 'bg-1', actor: 'ops@mayple.dev', status: 'open', reason: 'Critical remediation' },
      ],
      stepUp: { enabled: true, methods: ['totp', 'webauthn'], activeChallenges: [] },
      tenantBindings: [
        { id: 'tb-1', tenantId: 'tenant-a', target: 'org-1' },
      ],
      tenantScope: { tenantId: 'tenant-a', orgId: 'org-1', permissions: ['read', 'approve'] },
      orgTree: {
        id: 'org-root',
        name: 'Mayple Global',
        children: [
          { id: 'org-1', name: 'Mayple Labs', children: [] },
          { id: 'org-2', name: 'Catalyst Team', children: [] },
        ],
      },
      orgLifecycle: {
        'org-1': { status: 'active', updatedAt: new Date(now - 2 * DAY_MS).toISOString() },
        'org-2': { status: 'active', updatedAt: new Date(now - DAY_MS).toISOString() },
      },
    },
    observability: buildObservability(now, nextId),
    tools: buildTools(now),
    demos: {
      sessions: [
        { id: 'demo-session-1', sessionId: 'demo-session-1', status: 'active', createdAt: new Date(now - 90 * 60 * 1000).toISOString() },
      ],
    },
    orchestrations,
    orchestrationExecutions: executions,
    traceExports: [],
    search: {
      recent: [
        { type: 'agent', id: 'agent-1', title: 'Policy Sentinel', description: 'Primary policy agent' },
        { type: 'run', id: 'run-1001', title: 'Run 1001', description: 'Recent completed run' },
        { type: 'trace', id: 'trace-1001', title: 'Trace 1001', description: 'Approval trace' },
      ],
    },
    nextId,
  }

  return state
}
