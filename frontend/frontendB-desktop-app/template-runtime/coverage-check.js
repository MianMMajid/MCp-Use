const fs = require('fs');
const path = require('path');

// Scan all JSX/TSX files in the app directory
const baseDir = 'src/app';
const pages = [];
function walkDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full);
    else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.tsx')) pages.push(full);
  }
}
walkDir(baseDir);

// Also scan lib/api.js and layout files
const extraFiles = [
  'src/lib/api.js',
  'src/lib/api.ts',
].filter(f => fs.existsSync(f));

const allFiles = [...pages, ...extraFiles];
const allEndpoints = new Set();

for (const p of allFiles) {
  const content = fs.readFileSync(p, 'utf8');
  const patterns = [
    /['"`](\/api\/[^'"`\s{]+)/g,
    /['"`](\/admin\/api\/[^'"`\s{]+)/g,
    /['"`](\/health)/g,
    /['"`](\/ready)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(content)) !== null) {
      let ep = m[1];
      ep = ep.replace(/\$\{[^}]*\}/g, ':param');
      ep = ep.replace(/\?.*$/, '');
      allEndpoints.add(ep);
    }
  }
}

// Complete backend endpoints list
const backendEndpoints = [
  // Auth
  'POST /api/auth/login',
  'POST /api/auth/register',
  'POST /api/auth/logout',
  'GET /api/auth/me',
  'GET /api/auth/google/client-id',
  'POST /api/auth/google',
  'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password',
  'POST /api/auth/verify-email/request',
  'POST /api/auth/verify-email/confirm',
  'POST /api/auth/password-reset',
  'POST /api/auth/change-password',
  // User
  'GET /api/user/profile',
  'POST /api/user/change-password',
  // Billing
  'GET /api/billing/subscription',
  'POST /api/billing/create-checkout-session',
  'POST /api/billing/portal-session',
  'GET /api/billing/invoices',
  'POST /api/billing/subscription/cancel',
  'POST /api/billing/subscription/resume',
  'POST /api/billing/webhook',
  // Demo
  'GET /api/demo/sessions',
  'POST /api/demo/start',
  'POST /api/demo/sync',
  'POST /api/demo/ingest',
  'POST /api/demo/fork',
  'POST /api/demo/full',
  'POST /api/demo/audit',
  'POST /api/demo/block',
  'POST /api/demo/guard',
  'POST /api/demo/ml',
  'POST /api/demo/share',
  'POST /api/demo/suggest',
  'POST /api/demo/brief',
  'POST /api/openclaw/events',
  // Downstream
  'GET /api/downstream/apps',
  'GET /api/downstream/tools',
  'POST /api/downstream/dispatch',
  // Firewall
  'GET /api/firewall/state',
  'GET /api/firewall/rules/effective',
  'POST /api/firewall/decision',
  'POST /api/firewall/preview',
  'POST /api/firewall/chat',
  'GET /api/chat/capabilities',
  'POST /api/chat/stream',
  // HITL (gateway)
  'GET /api/hitl/approvals',
  'GET /api/hitl/approvals/watch',
  'POST /api/hitl/approvals/decision',
  // Traces
  'GET /api/traces',
  'GET /api/traces/:traceId',
  'GET /api/traces/search',
  'POST /api/traces/export',
  'POST /api/traces/clear',
  'GET /api/community/stats',
  'GET /api/community/traces',
  // Ops governance
  'GET /api/runs',
  'GET /api/runs/:runId',
  'GET /api/runs/:runId/timeline',
  'GET /api/runtime/status',
  'GET /api/runtime/dependencies',
  'GET /api/runtime/diag',
  'GET /api/runtime/logs',
  'GET /api/runtime/feature-capabilities',
  'GET /api/tools/registry',
  'GET /api/tools/registry/:toolId',
  'POST /api/tools/registry',
  'PATCH /api/tools/registry/:toolId',
  'GET /api/tools/policies',
  'POST /api/tools/policies/validate',
  'GET /api/tools/executions',
  'GET /api/tools/executions/:executionId',
  // OpenClaw agent
  'GET /api/openclaw/agent/status',
  'GET /api/openclaw/agent/sessions',
  'GET /api/openclaw/agent/sessions/:sessionId',
  'POST /api/openclaw/agent/sessions/:sessionId/cancel',
  'GET /api/openclaw/agent/sessions/:sessionId/stream',
  'GET /api/openclaw/agent/runs/:runId/artifacts',
  'POST /api/openclaw/agent/turn',
  'POST /api/openclaw/agent/longform',
  // OpenClaw CLI
  'GET /api/openclaw/cli/tools',
  'POST /api/openclaw/cli/exec',
  'GET /api/openclaw/cli/catalog',
  'GET /api/openclaw/cli/:tool/help',
  'POST /api/openclaw/cli/:tool/exec',
  // OpenClaw modifier
  'GET /api/openclaw/modifier/capabilities',
  'GET /api/operations/orchestrations/approvals',
  'GET /api/operations/orchestrations/approvals/:approvalId',
  'POST /api/operations/orchestrations/approvals/:approvalId/decision',
  'GET /api/operations/orchestrations/approvals/stream',
  'POST /api/openclaw/modifier/exec',
  // OpenClaw modifier ops
  'GET /api/operations/orchestrations/tenant-bindings',
  'POST /api/operations/orchestrations/tenant-bindings',
  'DELETE /api/operations/orchestrations/tenant-bindings',
  'GET /api/operations/orchestrations/tenant-scope',
  'GET /api/operations/orchestrations/org/tree',
  'POST /api/operations/orchestrations/org',
  'GET /api/operations/orchestrations/org/:orgId',
  'DELETE /api/operations/orchestrations/org/:orgId',
  'GET /api/operations/orchestrations/org/:orgId/lifecycle',
  'POST /api/operations/orchestrations/policy/simulate',
  'POST /api/operations/orchestrations/policy/diff',
  'POST /api/operations/orchestrations/policy/apply',
  'POST /api/operations/orchestrations/policy/dry-run',
  'POST /api/operations/orchestrations/policy/diff-before-apply',
  'POST /api/operations/orchestrations/policy/rollback',
  'GET /api/operations/orchestrations/escalation',
  'POST /api/operations/orchestrations/escalation',
  'POST /api/operations/orchestrations/escalation/escalate',
  'GET /api/operations/orchestrations/escalation/:approvalId/history',
  'GET /api/operations/orchestrations/break-glass',
  'POST /api/operations/orchestrations/break-glass',
  'POST /api/operations/orchestrations/break-glass/:id/review',
  'POST /api/operations/orchestrations/step-up/challenge',
  'POST /api/operations/orchestrations/step-up/verify',
  'GET /api/operations/orchestrations/step-up/status',
  'GET /api/operations/orchestrations/audit-chain',
  'POST /api/operations/orchestrations/audit-chain/verify',
  'GET /api/operations/orchestrations/compliance/summary',
  'POST /api/operations/orchestrations/compliance/report',
  'GET /api/operations/orchestrations/retention',
  'POST /api/operations/orchestrations/retention/enforce',
  'GET /api/operations/orchestrations/alert-webhooks',
  'POST /api/operations/orchestrations/alert-webhooks',
  'DELETE /api/operations/orchestrations/alert-webhooks/:id',
  'GET /api/operations/orchestrations/alert-webhooks/:id/deliveries',
  'GET /api/operations/orchestrations/rate-limit',
  'POST /api/operations/orchestrations/rate-limit/config',
  // Modifier observability
  'GET /api/observability/orchestrations/summary',
  'GET /api/observability/orchestrations/slo',
  'GET /api/observability/orchestrations/audit-log',
  'GET /api/observability/orchestrations/org',
  'POST /api/observability/orchestrations/siem-export',
  'POST /api/observability/orchestrations/flush',
  // Platform proxy
  'GET /api/integrations/catalog',
  'GET /api/integrations',
  'POST /api/integrations/:provider/connect',
  'POST /api/integrations/:provider/disconnect',
  'GET /api/integrations/:provider/oauth/start',
  'GET /api/integrations/:provider/oauth/callback',
  'POST /api/integrations/:provider/oauth/refresh',
  'POST /api/integrations/:provider/oauth/revoke',
  'GET /api/org',
  'POST /api/org',
  'PATCH /api/org/:orgId',
  'GET /api/org/:orgId/members',
  'GET /api/org/:orgId/invites',
  'POST /api/org/:orgId/invites',
  'POST /api/org/invites/:inviteId/accept',
  'DELETE /api/org/:orgId/members/:userId',
  'GET /api/org/:orgId/roles',
  'POST /api/org/:orgId/roles/:roleId/assign',
  'GET /api/user/api-keys',
  'POST /api/user/api-keys',
  'DELETE /api/user/api-keys/:keyId',
  'GET /api/org/:orgId/service-accounts',
  'POST /api/org/:orgId/service-accounts',
  'GET /api/org/:orgId/service-accounts/:id/keys',
  'POST /api/org/:orgId/service-accounts/:id/keys',
  'DELETE /api/org/:orgId/service-accounts/:id/keys/:keyId',
  'GET /api/entitlements',
  'GET /api/usage/summary',
  'GET /api/usage/timeseries',
  'GET /api/limits',
  'POST /api/limits/override',
  // Health
  'GET /health',
  // Admin console
  'GET /admin/api/policies',
  'GET /admin/api/policies/versions',
  'POST /admin/api/policies/versions/:versionId/activate',
  'POST /admin/api/policies/validate',
  'GET /admin/api/audit',
  'POST /admin/api/audit/export',
  'GET /admin/api/audit/schemas',
  'GET /admin/api/compliance/reports',
  'POST /admin/api/policies/reload',
  'GET /admin/api/approvals',
  'GET /admin/api/approvals/watch',
  'POST /admin/api/approvals/decision',
  'GET /admin/api/audit/dead-letter',
  'POST /admin/api/audit/dead-letter/:eventId/replay',
];

// Not UI-relevant
const skipped = new Set([
  'POST /api/billing/webhook',
  'GET /api/integrations/:provider/oauth/callback',
  'POST /api/auth/password-reset',
  'POST /api/auth/change-password',
]);

let covered = 0;
let missing = 0;
const missingList = [];
const coveredList = [];

for (const ep of backendEndpoints) {
  if (skipped.has(ep)) continue;
  const epPath = ep.split(' ').slice(1).join(' ');
  const normPath = epPath.replace(/:[a-zA-Z]+/g, ':param');

  let found = false;
  for (const fe of allEndpoints) {
    const feNorm = fe.replace(/:[a-zA-Z]+/g, ':param');
    if (feNorm === normPath) { found = true; break; }
    // Prefix match for parameterized paths
    const feBase = feNorm.split('/').slice(0, -1).join('/');
    const epBase = normPath.split('/').slice(0, -1).join('/');
    if (feBase === epBase && (feNorm.includes(':param') || normPath.includes(':param'))) { found = true; break; }
    if (normPath === feNorm || normPath.startsWith(feNorm + '/') || feNorm.startsWith(normPath + '/')) { found = true; break; }
  }

  if (found) { covered++; coveredList.push(ep); }
  else { missing++; missingList.push(ep); }
}

const total = covered + missing;
console.log('=== FRONTENDB COVERAGE REPORT ===');
console.log('Files scanned:', allFiles.length);
console.log('Unique endpoint patterns found:', allEndpoints.size);
console.log('Backend endpoints checked:', total);
console.log('Covered:', covered);
console.log('Missing:', missing);
console.log('Coverage:', Math.round(covered / total * 100) + '%');

if (missingList.length > 0) {
  console.log('\nMISSING ENDPOINTS:');
  missingList.forEach(e => console.log('  -', e));
}

console.log('\nAll endpoint patterns found in frontendB:');
[...allEndpoints].sort().forEach(e => console.log('  ', e));
