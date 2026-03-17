import assert from 'node:assert/strict'
import test from 'node:test'

import {
  degradedSecurityMessage,
  incidentColor,
  scanColor,
  scanLabel,
} from '../src/lib/maple-workspace/cyber-view-model.js'

test('scan helpers distinguish pending, malicious, and safe analysis states', () => {
  assert.equal(scanColor({ stage: 'analysis_pending', status: 'pending' }), 'amber')
  assert.equal(scanLabel({ stage: 'analysis_pending', status: 'pending' }), 'analysis pending')
  assert.equal(scanColor({ verdict: 'malicious', blocked: true, stage: 'final_verdict' }), 'rose')
  assert.equal(scanLabel({ verdict: 'safe', stage: 'reputation_enriched' }), 'safe (reputation)')
})

test('incident helper keeps open severe incidents high visibility', () => {
  assert.equal(incidentColor({ severity: 'RISK_SEVERITY_HIGH', state: 'new' }), 'rose')
  assert.equal(incidentColor({ severity: 'RISK_SEVERITY_MEDIUM', state: 'triaged' }), 'amber')
  assert.equal(incidentColor({ severity: 'RISK_SEVERITY_HIGH', state: 'closed' }), 'zinc')
})

test('degraded security message surfaces critical dependency failures', () => {
  const message = degradedSecurityMessage({
    providers: {
      contextWall: { reachable: false },
      cyberProxy: { reachable: false },
    },
    scanning: { degraded: true },
    security: {
      evidenceStore: { available: false },
      quarantineStore: { available: false },
    },
  })

  assert.match(message, /context policy unavailable/)
  assert.match(message, /cyber scan unavailable/)
  assert.match(message, /reputation enrichment degraded/)
  assert.match(message, /evidence store unavailable/)
  assert.match(message, /quarantine store unavailable/)
})
