#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const APP_ROOT = path.join(SRC, 'app', '(app)')

const ALLOWED_ROUTE_GROUPS = new Set([
  'agent-chat',
  'agents',
  'api-keys',
  'orchestrate',
  'profile',
  'runs',
  'service-accounts',
  'sessions',
  'settings',
  'tasks',
])

const ALLOWED_API_PREFIXES = [
  '/api/agents',
  '/api/auth',
  '/api/chat',
  '/api/firewall/state',
  '/api/hitl/approvals',
  '/api/limits',
  '/api/notifications',
  '/api/openclaw/agent',
  '/api/openclaw/cli',
  '/api/openclaw/modifier/capabilities',
  '/api/openclaw/modifier/exec',
  '/api/orchestrations',
  '/api/org',
  '/api/runs',
  '/api/runtime',
  '/api/search',
  '/api/sessions',
  '/api/tools',
  '/api/traces',
  '/api/usage',
  '/api/user',
]

const FORBIDDEN_PATTERNS = [
  '/admin/api/',
  '/api/openclaw/modifier/approvals',
  '/api/openclaw/modifier/observability',
  '/api/openclaw/modifier/ops',
  '/api/observability/orchestrations',
  '/api/operations/orchestrations',
]

const FILE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx'])
const violations = {
  routeGroups: [],
  forbiddenPatterns: [],
  disallowedEndpoints: [],
}

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }
    if (!FILE_EXTENSIONS.has(path.extname(entry.name))) continue
    const content = fs.readFileSync(fullPath, 'utf8')
    FORBIDDEN_PATTERNS.forEach((pattern) => {
      if (content.includes(pattern)) {
        violations.forbiddenPatterns.push({
          file: path.relative(ROOT, fullPath),
          pattern,
        })
      }
    })
    const endpointMatches = content.match(/\/api\/[A-Za-z0-9_/:*.-]+/g) ?? []
    for (const endpoint of endpointMatches) {
      const allowed = ALLOWED_API_PREFIXES.some((prefix) => endpoint.startsWith(prefix))
      if (!allowed) {
        violations.disallowedEndpoints.push({
          file: path.relative(ROOT, fullPath),
          endpoint,
        })
      }
    }
  }
}

const routeDirs = fs
  .readdirSync(APP_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

for (const routeGroup of routeDirs) {
  if (!ALLOWED_ROUTE_GROUPS.has(routeGroup)) {
    violations.routeGroups.push(routeGroup)
  }
}

walk(SRC)

if (
  violations.routeGroups.length === 0 &&
  violations.forbiddenPatterns.length === 0 &&
  violations.disallowedEndpoints.length === 0
) {
  console.log('B orchestration surface check passed.')
  process.exit(0)
}

if (violations.routeGroups.length > 0) {
  console.error('Unexpected Frontend B route groups detected:')
  for (const routeGroup of violations.routeGroups) {
    console.error(`- ${routeGroup}`)
  }
}

if (violations.forbiddenPatterns.length > 0) {
  console.error('Forbidden observability/safeguard API calls detected in Frontend B:')
  for (const item of violations.forbiddenPatterns) {
    console.error(`- ${item.file}: ${item.pattern}`)
  }
}

if (violations.disallowedEndpoints.length > 0) {
  console.error('Disallowed API endpoints detected in Frontend B:')
  for (const item of violations.disallowedEndpoints) {
    console.error(`- ${item.file}: ${item.endpoint}`)
  }
}

process.exit(1)
