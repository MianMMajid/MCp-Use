'use client'

import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Divider } from '@/components/divider'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Field, Label } from '@/components/fieldset'
import { SkeletonRows } from '@/components/skeleton'
import { formatDate, statusColor } from '@/lib/format'
import { loadJson, postJson, getCached } from '@/lib/api'

export default function ApprovalsContent() {
  const _ccaps = getCached('/api/openclaw/modifier/capabilities')
  const _cappr = getCached('/api/openclaw/modifier/approvals')
  const _hasCached = !!(_ccaps || _cappr)
  const [capabilities, setCapabilities] = useState(_ccaps || null)
  const [approvals, setApprovals] = useState(() => _cappr ? (Array.isArray(_cappr?.approvals) ? _cappr.approvals : Array.isArray(_cappr?.items) ? _cappr.items : []) : null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!_hasCached)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  // Decision dialog state
  const [decisionDialog, setDecisionDialog] = useState(null)
  const [decisionAction, setDecisionAction] = useState('')
  const [decisionReason, setDecisionReason] = useState('')
  const [decisionLoading, setDecisionLoading] = useState(false)

  // Step-up decide dialog state
  const [showStepUpDialog, setShowStepUpDialog] = useState(false)
  const [stepUpPayload, setStepUpPayload] = useState('')
  const [stepUpLoading, setStepUpLoading] = useState(false)

  // Exec dialog state
  const [showExecDialog, setShowExecDialog] = useState(false)
  const [execPayload, setExecPayload] = useState('')
  const [execLoading, setExecLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [capsData, approvalsData] = await Promise.all([
        loadJson('/api/openclaw/modifier/capabilities').catch(() => null),
        loadJson('/api/openclaw/modifier/approvals').catch(() => ({ items: [] })),
      ])
      setCapabilities(capsData)
      const items = Array.isArray(approvalsData?.approvals)
        ? approvalsData.approvals
        : Array.isArray(approvalsData?.items)
          ? approvalsData.items
          : []
      setApprovals(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setApprovals([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // SSE watch for live badge updates with heartbeat and reconnect
  useEffect(() => {
    let es = null
    let reconnectTimeout = null
    let heartbeatTimeout = null
    let reconnectAttempts = 0
    const MAX_RECONNECT = 5
    const HEARTBEAT_MS = 30000
    let mounted = true

    function resetHeartbeat() {
      clearTimeout(heartbeatTimeout)
      heartbeatTimeout = setTimeout(() => {
        if (es) { es.close(); reconnect() }
      }, HEARTBEAT_MS)
    }

    function reconnect() {
      if (!mounted) return
      if (reconnectAttempts >= MAX_RECONNECT) return
      reconnectAttempts++
      reconnectTimeout = setTimeout(connect, 5000)
    }

    const approvalHandler = () => {
      fetchData()
    }

    function connect() {
      if (!mounted) return
      es = new EventSource('/api/openclaw/modifier/approvals/watch')
      es.onopen = () => {
        reconnectAttempts = 0
        resetHeartbeat()
      }
      es.onmessage = () => {
        resetHeartbeat()
      }
      es.addEventListener('approval', approvalHandler)
      es.onerror = () => {
        es.removeEventListener('approval', approvalHandler)
        es.close()
        reconnect()
      }
    }

    connect()

    return () => {
      mounted = false
      clearTimeout(reconnectTimeout)
      clearTimeout(heartbeatTimeout)
      if (es) {
        es.removeEventListener('approval', approvalHandler)
        es.close()
      }
    }
  }, [fetchData])

  async function handleDecision() {
    if (!decisionDialog || !decisionAction) return
    setDecisionLoading(true)
    try {
      const approvalId = decisionDialog.approvalId || decisionDialog.id
      const res = await postJson(`/api/openclaw/modifier/approvals/${approvalId}/decision`, {
        action: decisionAction,
        reason: decisionReason,
      })
      if (res.ok) {
        setMessage('Decision submitted successfully.')
        setMessageType('success')
        setDecisionDialog(null)
        setDecisionAction('')
        setDecisionReason('')
        await fetchData()
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage(data.error || 'Failed to submit decision.')
        setMessageType('error')
      }
    } catch {
      setMessage('Failed to submit decision.')
      setMessageType('error')
    } finally {
      setDecisionLoading(false)
    }
  }

  async function handleStepUpDecide() {
    setStepUpLoading(true)
    try {
      let body = {}
      if (stepUpPayload.trim()) {
        try { body = JSON.parse(stepUpPayload) } catch { body = { raw: stepUpPayload } }
      }
      const res = await postJson('/api/openclaw/modifier/approvals/step-up-decide', body)
      if (res.ok) {
        setMessage('Step-up decision submitted.')
        setMessageType('success')
        setShowStepUpDialog(false)
        setStepUpPayload('')
        await fetchData()
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage(data.error || 'Step-up decision failed.')
        setMessageType('error')
      }
    } catch {
      setMessage('Step-up decision failed.')
      setMessageType('error')
    } finally {
      setStepUpLoading(false)
    }
  }

  async function handleExec() {
    setExecLoading(true)
    try {
      let body = {}
      if (execPayload.trim()) {
        try { body = JSON.parse(execPayload) } catch { body = { raw: execPayload } }
      }
      const res = await postJson('/api/openclaw/modifier/exec', body)
      if (res.ok) {
        setMessage('Execution submitted successfully.')
        setMessageType('success')
        setShowExecDialog(false)
        setExecPayload('')
        await fetchData()
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage(data.error || 'Execution failed.')
        setMessageType('error')
      }
    } catch {
      setMessage('Execution failed.')
      setMessageType('error')
    } finally {
      setExecLoading(false)
    }
  }

  return (
    <>
      <div className="mt-4 flex gap-2 justify-end">
        <Button color="orange" onClick={() => { setShowStepUpDialog(true); setStepUpPayload('') }}>
          Step-Up Decide
        </Button>
        <Button onClick={() => { setShowExecDialog(true); setExecPayload('') }}>
          Execute
        </Button>
        <Button className="-my-0.5" onClick={() => fetchData()}>
          Refresh
        </Button>
      </div>

      {message && (
        <p
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            messageType === 'success'
              ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
          }`}
        >
          {message}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            The gateway may be starting up or temporarily unavailable. Try refreshing the page.
          </p>
        </div>
      )}

      {/* Capabilities Summary */}
      {capabilities && (
        <>
          <Divider className="my-6" />
          <Subheading>Capabilities</Subheading>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.policies != null && (
              <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Policies</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
                  {typeof capabilities.policies === 'number' ? capabilities.policies : Array.isArray(capabilities.policies) ? capabilities.policies.length : '--'}
                </p>
              </div>
            )}
            {capabilities.modifiers != null && (
              <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Modifiers</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
                  {typeof capabilities.modifiers === 'number' ? capabilities.modifiers : Array.isArray(capabilities.modifiers) ? capabilities.modifiers.length : '--'}
                </p>
              </div>
            )}
            {capabilities.version && (
              <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Version</p>
                <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-100">
                  {capabilities.version}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      <Divider className="my-6" />

      {loading && <SkeletonRows rows={4} cols={5} />}

      {!loading && approvals && approvals.length === 0 && !error && (
        <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No modifier approvals</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            When modifiers request approvals, they will appear here.
          </p>
        </div>
      )}

      {!loading && approvals && approvals.length > 0 && (
        <>
          <Subheading>Pending Approvals</Subheading>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {approvals.length} approval{approvals.length !== 1 ? 's' : ''}
          </p>
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Approval ID</TableHeader>
                <TableHeader>Requested</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader className="text-right">Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {approvals.map((approval, idx) => {
                const approvalId = approval.approvalId || approval.id || `row-${idx}`
                const shortId = typeof approvalId === 'string' ? approvalId.substring(0, 12) : String(approvalId)
                const status = approval.status || approval.decision || 'pending'

                return (
                  <TableRow key={approvalId} href={`/modifier-approvals/${approvalId}`} title={`Approval ${shortId}`}>
                    <TableCell className="font-mono text-xs">{shortId}</TableCell>
                    <TableCell className="text-zinc-500">{formatDate(approval.requestedAt || approval.createdAt)}</TableCell>
                    <TableCell>{approval.type || approval.modifierType || '--'}</TableCell>
                    <TableCell>
                      <Badge color={statusColor(status)}>{status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {status === 'pending' && (
                        <div className="flex justify-end gap-2">
                          <Button
                            color="green"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setDecisionDialog(approval)
                              setDecisionAction('approve')
                              setDecisionReason('')
                            }}
                          >
                            Approve
                          </Button>
                          <Button
                            color="red"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setDecisionDialog(approval)
                              setDecisionAction('deny')
                              setDecisionReason('')
                            }}
                          >
                            Deny
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </>
      )}

      {/* Decision Dialog */}
      <Dialog open={decisionDialog !== null} onClose={() => setDecisionDialog(null)} size="sm">
        <DialogTitle>{decisionAction === 'approve' ? 'Approve' : 'Deny'} Request</DialogTitle>
        <DialogDescription>
          Provide a reason for {decisionAction === 'approve' ? 'approving' : 'denying'} this modifier approval.
        </DialogDescription>
        <DialogBody>
          <Field>
            <Label>Reason</Label>
            <Input
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
              placeholder="Enter reason..."
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setDecisionDialog(null)}>
            Cancel
          </Button>
          <Button
            color={decisionAction === 'approve' ? 'green' : 'red'}
            disabled={decisionLoading}
            onClick={handleDecision}
          >
            {decisionLoading ? 'Submitting...' : decisionAction === 'approve' ? 'Approve' : 'Deny'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Step-Up Decide Dialog */}
      <Dialog open={showStepUpDialog} onClose={() => setShowStepUpDialog(false)} size="sm">
        <DialogTitle>Step-Up Decide</DialogTitle>
        <DialogDescription>
          Submit an escalated step-up approval decision. Provide the approval context as JSON.
        </DialogDescription>
        <DialogBody>
          <Field>
            <Label>Payload (JSON)</Label>
            <Input
              value={stepUpPayload}
              onChange={(e) => setStepUpPayload(e.target.value)}
              placeholder='{"approvalId": "...", "action": "approve", "reason": "..."}'
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowStepUpDialog(false)}>
            Cancel
          </Button>
          <Button
            color="orange"
            disabled={stepUpLoading}
            onClick={handleStepUpDecide}
          >
            {stepUpLoading ? 'Submitting...' : 'Submit Step-Up Decision'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Exec Dialog */}
      <Dialog open={showExecDialog} onClose={() => setShowExecDialog(false)} size="sm">
        <DialogTitle>Execute Modifier</DialogTitle>
        <DialogDescription>
          Submit a modifier execution payload. Enter JSON or leave empty for default.
        </DialogDescription>
        <DialogBody>
          <Field>
            <Label>Payload (JSON)</Label>
            <Input
              value={execPayload}
              onChange={(e) => setExecPayload(e.target.value)}
              placeholder='{"key": "value"}'
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowExecDialog(false)}>
            Cancel
          </Button>
          <Button
            color="orange"
            disabled={execLoading}
            onClick={handleExec}
          >
            {execLoading ? 'Executing...' : 'Execute'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
