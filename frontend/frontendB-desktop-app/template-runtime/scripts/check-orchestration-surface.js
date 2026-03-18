#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const ROUTES = path.join(SRC, 'routes')

const REQUIRED_ROUTES = [
  '',
  'agents',
  'agents/[id]',
  'orchestrate',
  'orchestrate/[id]',
  'tasks',
  'settings',
  'sessions',
  'service-accounts',
  'api-keys',
  'profile',
  'login',
  'register',
  'forgot-password',
  'reset-password',
  'verify-email',
  'runs',
  'runs/[id]',
]

const ALLOWED_API_PREFIXES = [
  '/api/agents',
  '/api/auth',
  '/api/chat',
  '/api/firewalls',
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
  '/api/skills',
  '/api/tasks',
  '/api/tools',
  '/api/traces',
  '/api/usage',
  '/api/user',
]

const FORBIDDEN_PATTERNS = [
  '/api/openclaw/modifier/approvals',
  '/api/openclaw/modifier/observability',
  '/api/openclaw/modifier/ops',
  '/api/observability/orchestrations',
  '/api/operations/orchestrations',
]

const FILE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.svelte'])
const violations = {
  missingRoutes: [],
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
    if (entry.name.includes('.test.')) continue
    if (entry.name === 'proxy.js' || entry.name === 'proxy.disabled.js') continue
    if (fullPath.includes(`${path.sep}lib${path.sep}fake-mode${path.sep}`)) continue
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

const ROUTE_GROUP_DIRS = ['', '(app)']

for (const route of REQUIRED_ROUTES) {
  const found = ROUTE_GROUP_DIRS.some((group) => {
    const base = group ? path.join(ROUTES, group) : ROUTES
    const routeFile = route === '' ? path.join(base, '+page.svelte') : path.join(base, route, '+page.svelte')
    const fallback = route === '' ? null : path.join(base, route, '+page.server.js')
    return fs.existsSync(routeFile) || (fallback && fs.existsSync(fallback))
  })
  if (!found) {
    violations.missingRoutes.push(route || '/')
  }
}

walk(SRC)

if (
  violations.missingRoutes.length === 0 &&
  violations.forbiddenPatterns.length === 0 &&
  violations.disallowedEndpoints.length === 0
) {
  console.log('B orchestration surface check passed.')
  process.exit(0)
}

if (violations.missingRoutes.length > 0) {
  console.error('Missing required Svelte routes:')
  for (const route of violations.missingRoutes) {
    console.error(`- ${route}`)
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
