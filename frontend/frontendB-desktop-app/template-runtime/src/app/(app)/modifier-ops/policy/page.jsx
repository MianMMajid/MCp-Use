'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Heading, Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Input } from '@/components/input'
import { Textarea } from '@/components/textarea'
import { Field, Label } from '@/components/fieldset'
import { Link } from '@/components/link'
import { DescriptionList, DescriptionTerm, DescriptionDetails } from '@/components/description-list'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, postJson } from '@/lib/api'

function formatDate(dateStr) {
  if (!dateStr) return '--'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return dateStr }
}

function statusColor(s) {
  if (!s) return 'zinc'
  const v = s.toLowerCase()
  if (v === 'active' || v === 'verified' || v === 'success') return 'green'
  if (v === 'failed' || v === 'error' || v === 'expired') return 'red'
  if (v === 'pending' || v === 'challenged') return 'orange'
  return 'zinc'
}

export default function ModifierOpsPolicyPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  // Policy state
  const [policyInput, setPolicyInput] = useState('')
  const [policyResult, setPolicyResult] = useState(null)
  const [policyLoading, setPolicyLoading] = useState(false)

  // Step-up auth state
  const [stepUpStatus, setStepUpStatus] = useState(null)
  const [challengeResult, setChallengeResult] = useState(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [stepUpLoading, setStepUpLoading] = useState(false)

  // Escalation state
  const [escalationChain, setEscalationChain] = useState(null)
  const [escalationHistory, setEscalationHistory] = useState(null)
  const [showUpsert, setShowUpsert] = useState(false)
  const [upsertPayload, setUpsertPayload] = useState('')
  const [upsertLoading, setUpsertLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [statusData, chainData, historyData] = await Promise.all([
          loadJson('/api/openclaw/modifier/ops/step-up/status').catch(() => null),
          loadJson('/api/openclaw/modifier/ops/escalation').catch(() => null),
          loadJson('/api/openclaw/modifier/ops/escalation/history').catch(() => null),
        ])
        if (cancelled) return
        setStepUpStatus(statusData)
        setEscalationChain(chainData)
        setEscalationHistory(Array.isArray(historyData?.items) ? historyData.items : Array.isArray(historyData) ? historyData : [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function handlePolicyAction(action) {
    setPolicyLoading(true)
    setPolicyResult(null)
    try {
      let body = {}
      if (policyInput.trim()) { try { body = JSON.parse(policyInput) } catch { body = { raw: policyInput } } }
      const res = await postJson(`/api/openclaw/modifier/ops/policy/${action}`, body)
      const data = await res.json().catch(() => ({}))
      setPolicyResult({ action, ...data })
    } catch {
      setPolicyResult({ error: `${action} failed` })
    } finally {
      setPolicyLoading(false)
    }
  }

  async function handleChallenge() {
    setStepUpLoading(true)
    try {
      const res = await postJson('/api/openclaw/modifier/ops/step-up/challenge', {})
      const data = await res.json().catch(() => ({}))
      setChallengeResult(data)
      setMessage('Challenge sent.'); setMessageType('success')
    } catch {
      setMessage('Challenge failed.'); setMessageType('error')
    } finally { setStepUpLoading(false) }
  }

  async function handleVerify() {
    setStepUpLoading(true)
    try {
      const res = await postJson('/api/openclaw/modifier/ops/step-up/verify', { code: verifyCode })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setMessage('Verified successfully.'); setMessageType('success') }
      else { setMessage(data.error || 'Verification failed.'); setMessageType('error') }
    } catch {
      setMessage('Verification failed.'); setMessageType('error')
    } finally { setStepUpLoading(false) }
  }

  async function handleUpsertEscalation() {
    setUpsertLoading(true)
    try {
      let body = {}
      if (upsertPayload.trim()) { try { body = JSON.parse(upsertPayload) } catch { body = { raw: upsertPayload } } }
      const res = await postJson('/api/openclaw/modifier/ops/escalation', body)
      if (res.ok) { setMessage('Escalation chain updated.'); setMessageType('success'); setShowUpsert(false) }
      else { setMessage('Failed to update escalation.'); setMessageType('error') }
    } catch { setMessage('Failed to update escalation.'); setMessageType('error') }
    finally { setUpsertLoading(false) }
  }

  async function handleEscalate() {
    try {
      const res = await postJson('/api/openclaw/modifier/ops/escalation/escalate', {})
      if (res.ok) { setMessage('Escalation triggered.'); setMessageType('success') }
      else { setMessage('Escalation failed.'); setMessageType('error') }
    } catch { setMessage('Escalation failed.'); setMessageType('error') }
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Modifier Operations</Heading>
      </div>

      {/* Sub-nav */}
      <div className="mt-4 flex gap-4 text-sm font-medium">
        <Link href="/modifier-ops" className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">Governance</Link>
        <span className="text-zinc-950 dark:text-white">Policy & Escalation</span>
        <Link href="/modifier-ops/compliance" className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">Compliance & Alerts</Link>
      </div>

      {message && (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${messageType === 'success' ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'}`}>
          {message}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
        </div>
      )}

      {/* Policy Management */}
      <Divider className="my-6" />
      <Subheading>Policy Management</Subheading>
      <div className="mt-4 space-y-4">
        <Field>
          <Label>Policy Definition (JSON)</Label>
          <Textarea rows={6} value={policyInput} onChange={(e) => setPolicyInput(e.target.value)} placeholder='{"rules": [...]}' />
        </Field>
        <div className="flex flex-wrap gap-2">
          {['simulate', 'diff', 'apply', 'dry-run', 'diff-before-apply', 'rollback'].map((action) => (
            <Button key={action} outline disabled={policyLoading} onClick={() => handlePolicyAction(action)}>
              {policyLoading ? '...' : action.charAt(0).toUpperCase() + action.slice(1)}
            </Button>
          ))}
        </div>
        {policyResult && (
          <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <p className="text-xs font-medium text-zinc-500">{policyResult.action}</p>
            <pre className="mt-2 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(policyResult, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* Step-Up Auth */}
      <Divider className="my-6" />
      <Subheading>Step-Up Authentication</Subheading>
      {stepUpStatus && (
        <DescriptionList className="mt-4">
          {Object.entries(stepUpStatus).map(([key, val]) => (
            <div key={key}>
              <DescriptionTerm>{key}</DescriptionTerm>
              <DescriptionDetails>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</DescriptionDetails>
            </div>
          ))}
        </DescriptionList>
      )}
      <div className="mt-4 flex items-end gap-4">
        <Button onClick={handleChallenge} disabled={stepUpLoading}>
          {stepUpLoading ? 'Sending...' : 'Send Challenge'}
        </Button>
        <Field>
          <Label>Verification Code</Label>
          <Input value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder="Enter code" />
        </Field>
        <Button onClick={handleVerify} disabled={stepUpLoading || !verifyCode}>
          Verify
        </Button>
      </div>

      {/* Escalation */}
      <Divider className="my-6" />
      <div className="flex items-center justify-between">
        <Subheading>Escalation</Subheading>
        <div className="flex gap-2">
          <Button onClick={() => { setShowUpsert(true); setUpsertPayload('') }}>Configure Chain</Button>
          <Button color="red" onClick={handleEscalate}>Escalate</Button>
        </div>
      </div>
      {escalationChain && (
        <pre className="mt-4 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-800">{JSON.stringify(escalationChain, null, 2)}</pre>
      )}
      {escalationHistory && escalationHistory.length > 0 && (
        <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
          <TableHead>
            <TableRow>
              <TableHeader>Time</TableHeader>
              <TableHeader>Level</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Details</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {escalationHistory.map((entry, idx) => (
              <TableRow key={entry.id || idx}>
                <TableCell className="text-zinc-500">{formatDate(entry.timestamp || entry.createdAt)}</TableCell>
                <TableCell>{entry.level || '--'}</TableCell>
                <TableCell><Badge color={statusColor(entry.status)}>{entry.status || '--'}</Badge></TableCell>
                <TableCell className="text-xs">{entry.details || entry.message || '--'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Upsert Escalation Dialog */}
      <Dialog open={showUpsert} onClose={() => setShowUpsert(false)} size="sm">
        <DialogTitle>Configure Escalation Chain</DialogTitle>
        <DialogDescription>Define or update the escalation chain configuration.</DialogDescription>
        <DialogBody>
          <Field><Label>Chain Config (JSON)</Label><Textarea rows={5} value={upsertPayload} onChange={(e) => setUpsertPayload(e.target.value)} placeholder='{"levels": [...]}' /></Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowUpsert(false)}>Cancel</Button>
          <Button disabled={upsertLoading} onClick={handleUpsertEscalation}>{upsertLoading ? 'Saving...' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
