#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const scriptDir = path.dirname(new URL(import.meta.url).pathname)
const repoRoot = path.resolve(scriptDir, '../../../../')

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8')
}

function has(file, pattern) {
  const text = read(file)
  return pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern)
}

const files = {
  pg: 'backend/backendB-core-services/shared/packages/maple-persistence/src/pg-db.js',
  orchRoutes: 'backend/backendB-core-services/gateway-api/service/src/routes/orchestration-routes.js',
  openclawRoutes: 'backend/backendB-core-services/gateway-api/service/src/routes/openclaw-agent-routes.js',
  openclawRuntime: 'backend/backendB-core-services/gateway-api/service/src/core/openclaw-agent-runtime.js',
  dataflowRoutes: 'backend/backendB-core-services/gateway-api/service/src/routes/dataflow-durability-routes.js',
  firewallChatRoutes: 'backend/backendB-core-services/gateway-api/service/src/routes/firewall-chat-routes.js',
  firewallsPage: 'frontend/frontendB-desktop-app/template-runtime/src/routes/firewalls/+page.svelte',
  skillsPage: 'frontend/frontendB-desktop-app/template-runtime/src/routes/skills/+page.svelte',
  chatStore: 'frontend/frontendB-desktop-app/template-runtime/src/lib/stores/chat-store.js',
}

const rows = [
  {
    domain: 'orchestration_conversation',
    apiRead: has(files.orchRoutes, '/api/orchestrations/:id/conversation') && has(files.orchRoutes, 'listConversationItems('),
    apiWrite: has(files.orchRoutes, 'appendConversationItem('),
    db: has(files.pg, 'orchestration_conversation_messages') && has(files.pg, 'createOrchestrationConversationMessage('),
    stream: false,
  },
  {
    domain: 'orchestration_execution_tasks_reassignments',
    apiRead: has(files.orchRoutes, '/api/orchestrations/executions/:executionId/tasks') && has(files.orchRoutes, '/api/orchestrations/executions/:executionId/reassignments'),
    apiWrite: has(files.orchRoutes, 'createOrchestrationExecutionReassignment') && has(files.orchRoutes, 'upsertExecutionTask('),
    db: has(files.pg, 'orchestration_execution_tasks') && has(files.pg, 'orchestration_execution_reassignments'),
    stream: has(files.orchRoutes, 'subscribeOrchestrationExecutionEvents('),
  },
  {
    domain: 'openclaw_sessions_runs_events',
    apiRead: has(files.openclawRoutes, '/api/openclaw/agent/sessions') && has(files.openclawRoutes, '/api/openclaw/agent/sessions/:sessionId/stream'),
    apiWrite: has(files.openclawRuntime, 'persistSessionState(') && has(files.openclawRuntime, 'persistRunState('),
    db: has(files.pg, 'openclaw_sessions') && has(files.pg, 'openclaw_runs') && has(files.pg, 'openclaw_session_events'),
    stream: has(files.openclawRoutes, 'database.listOpenClawSessionEvents('),
  },
  {
    domain: 'firewalls_objects',
    apiRead: has(files.dataflowRoutes, 'server.app.get("/api/firewalls"'),
    apiWrite: has(files.dataflowRoutes, 'server.app.post("/api/firewalls"') && has(files.dataflowRoutes, '/api/firewalls/:id/simulate'),
    db: has(files.pg, 'firewall_objects') && has(files.pg, 'firewall_policy_revisions') && has(files.pg, 'firewall_object_snippets'),
    stream: false,
  },
  {
    domain: 'skills_custom_activity',
    apiRead: has(files.dataflowRoutes, '/api/skills/custom') && has(files.dataflowRoutes, '/api/skills/activity'),
    apiWrite: has(files.dataflowRoutes, 'server.app.post("/api/skills/custom"') && has(files.dataflowRoutes, 'server.app.post("/api/skills/activity"'),
    db: has(files.pg, 'skills_custom') && has(files.pg, 'skills_activity'),
    stream: false,
  },
  {
    domain: 'chat_transcripts_stream_events',
    apiRead: has(files.dataflowRoutes, '/api/chat/conversations') && has(files.dataflowRoutes, '/api/chat/conversations/:id/messages'),
    apiWrite: has(files.chatStore, '/api/chat/conversations/${conversationId}/messages') && has(files.firewallChatRoutes, 'dbChatTranscriptsEnabled'),
    db: has(files.pg, 'chat_conversations') && has(files.pg, 'chat_messages') && has(files.pg, 'chat_stream_events'),
    stream: has(files.firewallChatRoutes, 'appendChatStreamEvent('),
  },
]

const withVerdict = rows.map((row) => ({
  ...row,
  verdict: row.apiRead && row.apiWrite && row.db ? (row.stream || !row.domain.includes('stream')) : false,
}))

const summary = {
  generatedAt: new Date().toISOString(),
  totalDomains: withVerdict.length,
  fullyDurable: withVerdict.filter((row) => row.verdict).length,
  gaps: withVerdict.filter((row) => !row.verdict).map((row) => row.domain),
}

const jsonOut = {
  summary,
  rows: withVerdict,
}

const docsDir = path.join(repoRoot, 'docs')
fs.mkdirSync(docsDir, { recursive: true })
fs.writeFileSync(path.join(docsDir, 'frontendB-dataflow-db-stream-coverage.json'), `${JSON.stringify(jsonOut, null, 2)}\n`)

const mdLines = []
mdLines.push('# Frontend B Dataflow DB + Stream Coverage')
mdLines.push('')
mdLines.push(`Generated: ${summary.generatedAt}`)
mdLines.push('')
mdLines.push(`- Domains audited: ${summary.totalDomains}`)
mdLines.push(`- Fully durable domains: ${summary.fullyDurable}`)
mdLines.push(`- Gaps: ${summary.gaps.length === 0 ? 'none' : summary.gaps.join(', ')}`)
mdLines.push('')
mdLines.push('| Domain | API Read | API Write | DB Durable | Stream Durable | Verdict |')
mdLines.push('| --- | --- | --- | --- | --- | --- |')
for (const row of withVerdict) {
  mdLines.push(`| ${row.domain} | ${row.apiRead ? 'yes' : 'no'} | ${row.apiWrite ? 'yes' : 'no'} | ${row.db ? 'yes' : 'no'} | ${row.stream ? 'yes' : 'no'} | ${row.verdict ? 'PASS' : 'GAP'} |`)
}
mdLines.push('')
fs.writeFileSync(path.join(docsDir, 'frontendB-dataflow-db-stream-coverage.md'), `${mdLines.join('\n')}\n`)

if (process.argv.includes('--check')) {
  const hasGap = withVerdict.some((row) => !row.verdict)
  if (hasGap) {
    console.error('dataflow coverage check failed: one or more domains have gaps')
    process.exit(1)
  }
}

console.log(`Wrote ${path.join('docs', 'frontendB-dataflow-db-stream-coverage.md')}`)
console.log(`Wrote ${path.join('docs', 'frontendB-dataflow-db-stream-coverage.json')}`)
