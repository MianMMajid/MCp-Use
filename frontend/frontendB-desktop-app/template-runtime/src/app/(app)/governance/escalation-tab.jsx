'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogBody, DialogActions } from '@/components/dialog'
import { Divider } from '@/components/divider'
import { Input } from '@/components/input'
import { Subheading } from '@/components/heading'
import { Textarea } from '@/components/textarea'
import { Field, Label } from '@/components/fieldset'
import { DescriptionList, DescriptionTerm, DescriptionDetails } from '@/components/description-list'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, postJson } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'
import { SkeletonRows } from '@/components/skeleton'

export default function EscalationTab() {
  const [loading, setLoading] = useState(true)
  const [stepUpStatus, setStepUpStatus] = useState(null)
  const [escalationChain, setEscalationChain] = useState(null)
  const [escalationHistory, setEscalationHistory] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Step-up
  const [challengeResult, setChallengeResult] = useState(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [stepUpLoading, setStepUpLoading] = useState(false)

  // Escalation chain config
  const [showChainDialog, setShowChainDialog] = useState(false)
  const [chainPayload, setChainPayload] = useState('')
  const [chainSaving, setChainSaving] = useState(false)

  async function fetchAll() {
    setLoading(true)
    try {
      const [status, chain, history] = await Promise.all([
        loadJson('/api/operations/orchestrations/step-up/status').catch(() => null),
        loadJson('/api/operations/orchestrations/escalation').catch(() => null),
        loadJson('/api/operations/orchestrations/escalation/history').catch(() => null),
      ])
      setStepUpStatus(status)
      setEscalationChain(chain)
      setEscalationHistory(Array.isArray(history) ? history : Array.isArray(history?.events) ? history.events : Array.isArray(history?.history) ? history.history : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  async function handleChallenge() {
    setStepUpLoading(true)
    try {
      const res = await postJson('/api/operations/orchestrations/step-up/challenge', {})
      const data = await res.json().catch(() => ({}))
      setChallengeResult(data)
      setMessage('Challenge sent')
    } catch {
      setMessage('Failed to send challenge')
    } finally {
      setStepUpLoading(false)
    }
  }

  async function handleVerify() {
    setStepUpLoading(true)
    try {
      const res = await postJson('/api/operations/orchestrations/step-up/verify', { code: verifyCode })
      const data = await res.json().catch(() => ({}))
      setChallengeResult(data)
      setMessage(data.verified ? 'Verification successful' : 'Verification response received')
      setVerifyCode('')
      fetchAll()
    } catch {
      setMessage('Verification failed')
    } finally {
      setStepUpLoading(false)
    }
  }

  async function handleSaveChain() {
    setChainSaving(true)
    try {
      let body
      try { body = JSON.parse(chainPayload) } catch { body = { config: chainPayload } }
      await postJson('/api/operations/orchestrations/escalation', body)
      setShowChainDialog(false)
      setMessage('Escalation chain updated')
      fetchAll()
    } catch {
      setMessage('Failed to update escalation chain')
    } finally {
      setChainSaving(false)
    }
  }

  async function handleEscalate() {
    try {
      await postJson('/api/operations/orchestrations/escalation/escalate', {})
      setMessage('Escalation triggered')
      fetchAll()
    } catch {
      setMessage('Failed to trigger escalation')
    }
  }

  if (loading) return <SkeletonRows />

  return (
    <div className="mt-4 space-y-8">
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{error}</p>
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 dark:border-sky-900 dark:bg-sky-950/40">
          <p className="text-sm text-sky-800 dark:text-sky-300">{message}</p>
        </div>
      )}

      {/* Step-Up Authentication */}
      <div>
        <Subheading>Step-Up Authentication</Subheading>
        {stepUpStatus && typeof stepUpStatus === 'object' ? (
          <DescriptionList className="mt-3">
            {Object.entries(stepUpStatus).map(([key, value]) => (
              <div key={key}>
                <DescriptionTerm>{key}</DescriptionTerm>
                <DescriptionDetails>
                  {key.toLowerCase().includes('status')
                    ? <Badge color={statusColor(String(value))}>{String(value)}</Badge>
                    : typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </DescriptionDetails>
              </div>
            ))}
          </DescriptionList>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No step-up status available.</p>
        )}

        <div className="mt-4 flex items-end gap-3">
          <Button disabled={stepUpLoading} onClick={handleChallenge}>Send Challenge</Button>
          <Field className="flex-1 max-w-xs">
            <Label>Verification Code</Label>
            <Input value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder="Enter code" />
          </Field>
          <Button disabled={stepUpLoading || !verifyCode.trim()} onClick={handleVerify}>Verify</Button>
        </div>

        {challengeResult && (
          <pre className="mt-3 overflow-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {JSON.stringify(challengeResult, null, 2)}
          </pre>
        )}
      </div>

      <Divider />

      {/* Escalation Chain */}
      <div>
        <div className="flex items-center justify-between">
          <Subheading>Escalation Chain</Subheading>
          <div className="flex gap-2">
            <Button onClick={() => { setChainPayload(JSON.stringify(escalationChain || {}, null, 2)); setShowChainDialog(true) }}>
              Configure
            </Button>
            <Button color="red" onClick={handleEscalate}>Escalate</Button>
          </div>
        </div>

        {escalationChain && (
          <div className="mt-3">
            {Array.isArray(escalationChain?.steps || escalationChain?.chain) ? (
              <div className="space-y-2">
                {(escalationChain.steps || escalationChain.chain).map((step, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">{step.recipient || step.name || `Step ${idx + 1}`}</p>
                      <p className="text-xs text-zinc-500">{step.method || step.channel || '--'} &middot; Timeout: {step.timeout || '--'}</p>
                    </div>
                    {step.status && <Badge color={statusColor(step.status)}>{step.status}</Badge>}
                  </div>
                ))}
              </div>
            ) : (
              <pre className="overflow-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {JSON.stringify(escalationChain, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      <Divider />

      {/* Escalation History */}
      <div>
        <Subheading>Escalation History</Subheading>
        {escalationHistory.length > 0 ? (
          <Table className="mt-3 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Time</TableHeader>
                <TableHeader>Level</TableHeader>
                <TableHeader>Recipient</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Resolution</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {escalationHistory.map((evt, idx) => (
                <TableRow key={evt.id || idx}>
                  <TableCell className="text-zinc-500">{formatDate(evt.timestamp || evt.createdAt || evt.at)}</TableCell>
                  <TableCell>{evt.level ?? evt.step ?? '--'}</TableCell>
                  <TableCell>{evt.recipient || evt.name || '--'}</TableCell>
                  <TableCell>
                    <Badge color={statusColor(evt.status)}>{evt.status || '--'}</Badge>
                  </TableCell>
                  <TableCell className="text-zinc-500">{evt.resolution || evt.result || '--'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No escalation history.</p>
        )}
      </div>

      {/* Chain Config Dialog */}
      <Dialog open={showChainDialog} onClose={() => setShowChainDialog(false)} size="sm">
        <DialogTitle>Configure Escalation Chain</DialogTitle>
        <DialogBody>
          <Field>
            <Label>Chain Configuration (JSON)</Label>
            <Textarea rows={10} value={chainPayload} onChange={(e) => setChainPayload(e.target.value)} className="font-mono text-xs" />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowChainDialog(false)}>Cancel</Button>
          <Button disabled={chainSaving} onClick={handleSaveChain}>
            {chainSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
