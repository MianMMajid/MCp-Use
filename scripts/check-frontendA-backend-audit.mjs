import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve('/Users/omarramadan/Desktop/mcp_firewall')
const ARTIFACTS = resolve(ROOT, 'artifacts/audit')

function fail(message) {
  console.error(`[frontendA-backend-audit:check] ${message}`)
  process.exit(1)
}

function readJson(path) {
  if (!existsSync(path)) fail(`Missing artifact: ${path}`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const controls = readJson(resolve(ARTIFACTS, 'frontendA-control-inventory.json'))
const lineage = readJson(resolve(ARTIFACTS, 'frontendA-endpoint-lineage.json'))
const persistence = readJson(resolve(ARTIFACTS, 'frontendA-persistence-map.json'))
const runtime = readJson(resolve(ARTIFACTS, 'frontendA-runtime-verification.json'))
const gaps = readJson(resolve(ARTIFACTS, 'frontendA-remediation-gaps.json'))

if (!Array.isArray(controls) || controls.length === 0) fail('Control inventory is empty')
if (!Array.isArray(lineage) || lineage.length === 0) fail('Endpoint lineage is empty')
if (!Array.isArray(persistence?.endpoint_persistence)) fail('Persistence endpoint mapping missing')
if (!Array.isArray(runtime?.fake_mode) || runtime.fake_mode.length === 0) fail('Fake runtime verification missing')
if (!Array.isArray(runtime?.real_mode) || runtime.real_mode.length === 0) fail('Real runtime probe missing')
if (!Array.isArray(gaps)) fail('Remediation gap list missing')

const controlsMissing = controls.filter(
  (control) => control.action_type === 'business-action' && !control.expected_api,
)

const gapKeys = new Set(gaps.map((gap) => String(gap.control_id ?? '')))
const uncoveredMissing = controlsMissing.filter((control) => !gapKeys.has(control.control_id))
if (uncoveredMissing.length > 0) {
  fail(`Business-action controls missing API are not captured in remediation list: ${uncoveredMissing.map((item) => item.control_id).join(', ')}`)
}

const lineageEndpoints = new Set(lineage.map((entry) => `${entry.method} ${entry.bff_endpoint}`))
const persistenceEndpoints = new Set(persistence.endpoint_persistence.map((entry) => entry.endpoint))
const missingPersistence = [...lineageEndpoints].filter((endpoint) => !persistenceEndpoints.has(endpoint))
if (missingPersistence.length > 0) {
  fail(`Endpoints missing persistence classification: ${missingPersistence.join(', ')}`)
}

const missingDownstreamCount = lineage.reduce(
  (count, entry) => count + entry.downstream.filter((route) => route.implemented === false).length,
  0,
)

console.log('[frontendA-backend-audit:check] PASS')
console.log(`controls=${controls.length}`)
console.log(`business_controls_missing_api=${controlsMissing.length}`)
console.log(`lineage_endpoints=${lineage.length}`)
console.log(`downstream_missing_implementations=${missingDownstreamCount}`)
console.log(`gaps_total=${gaps.length}`)
