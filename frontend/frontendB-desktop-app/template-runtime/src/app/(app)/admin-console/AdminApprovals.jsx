'use client'

import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Textarea } from '@/components/textarea'
import { Field, Label } from '@/components/fieldset'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { SkeletonRows } from '@/components/skeleton'
import { loadJson, postJson, getCached } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'

export default function AdminApprovals() {
  const _ca = getCached('/admin/api/approvals')
  const _cdl = getCached('/admin/api/audit/dead-letter')
  const _hasCached = !!(_ca || _cdl)
  const [approvals, setApprovals] = useState(() => _ca ? (Array.isArray(_ca?.approvals) ? _ca.approvals : Array.isArray(_ca) ? _ca : []) : null)
  const [deadLetter, setDeadLetter] = useState(() => _cdl ? (Array.isArray(_cdl?.events) ? _cdl.events : Array.isArray(_cdl) ? _cdl : []) : null)
  const [loading, setLoading] = useState(!_hasCached)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  // Decision dialog
  const [showDecision, setShowDecision] = useState(false)
  const [decisionPayload, setDecisionPayload] = useState('')
  const [decisionLoading, setDecisionLoading] = useState(false)

  const fetchData = useCallback(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [approvalsData, dlData] = await Promise.all([
          loadJson('/admin/api/approvals').catch(() => null),
          loadJson('/admin/api/audit/dead-letter').catch(() => null),
        ])
        if (cancelled) return
        setApprovals(
          Array.isArray(approvalsData?.approvals)
            ? approvalsData.approvals
            : Array.isArray(approvalsData)
              ? approvalsData
              : [],
        )
        setDeadLetter(
          Array.isArray(dlData?.events)
            ? dlData.events
            : Array.isArray(dlData)
              ? dlData
              : [],
        )
      } catch {
        /* handled per-call */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const cancel = fetchData()

    // SSE live updates for approvals with heartbeat and reconnect
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

    function connect() {
      if (!mounted) return
      try {
        es = new EventSource('/admin/api/approvals/watch')
        es.onopen = () => {
          reconnectAttempts = 0
          resetHeartbeat()
        }
        es.onmessage = (event) => {
          resetHeartbeat()
          try {
            const data = JSON.parse(event.data)
            if (data.approvals) {
              setApprovals(Array.isArray(data.approvals) ? data.approvals : [])
            } else if (data.type === 'update') {
              fetchData()
            }
          } catch { /* ignore */ }
        }
        es.onerror = () => {
          es.close()
          reconnect()
        }
      } catch { /* SSE not available */ }
    }

    connect()

    return () => {
      mounted = false
      cancel()
      clearTimeout(reconnectTimeout)
      clearTimeout(heartbeatTimeout)
      if (es) es.close()
    }
  }, [fetchData])

  async function handleDecision() {
    setDecisionLoading(true)
    try {
      let body = {}
      if (decisionPayload.trim()) {
        try { body = JSON.parse(decisionPayload) } catch { body = { raw: decisionPayload } }
      }
      const res = await postJson('/admin/api/approvals/decision', body)
      if (res.ok) { setMessage('Decision submitted.'); setMessageType('success'); setShowDecision(false); fetchData() }
      else { setMessage('Decision failed.'); setMessageType('error') }
    } catch { setMessage('Decision failed.'); setMessageType('error') }
    finally { setDecisionLoading(false) }
  }

  async function handleReplayDeadLetter(eventId) {
    try {
      const res = await postJson(`/admin/api/audit/dead-letter/${eventId}/replay`, {})
      if (res.ok) { setMessage('Event replayed.'); setMessageType('success'); fetchData() }
      else { setMessage('Replay failed.'); setMessageType('error') }
    } catch { setMessage('Replay failed.'); setMessageType('error') }
  }

  if (loading) return <div className="mt-4"><SkeletonRows /></div>

  return (
    <>
      {message && (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${messageType === 'success' ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'}`}>
          {message}
        </p>
      )}

      {/* Approvals */}
      <Divider className="my-6" />
      <div className="flex items-center justify-between">
        <Subheading>Admin Approvals</Subheading>
        <Button onClick={() => { setShowDecision(true); setDecisionPayload('') }}>Submit Decision</Button>
      </div>
      {approvals && approvals.length > 0 ? (
        <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
          <TableHead>
            <TableRow>
              <TableHeader>ID</TableHeader>
              <TableHeader>Action</TableHeader>
              <TableHeader>Requested</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {approvals.map((a, idx) => {
              const aId = a.approvalId || a.id || `approval-${idx}`
              return (
                <TableRow key={aId}>
                  <TableCell className="font-mono text-xs">{typeof aId === 'string' ? aId.substring(0, 12) : String(aId)}</TableCell>
                  <TableCell>{a.action || a.type || '--'}</TableCell>
                  <TableCell className="text-zinc-500">{formatDate(a.requestedAt || a.createdAt)}</TableCell>
                  <TableCell><Badge color={statusColor(a.status || a.decision)}>{a.status || a.decision || 'pending'}</Badge></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      ) : (
        <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No admin approvals</p>
        </div>
      )}

      {/* Dead Letter Queue */}
      <Divider className="my-6" />
      <Subheading>Dead Letter Queue</Subheading>
      {deadLetter && deadLetter.length > 0 ? (
        <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
          <TableHead>
            <TableRow>
              <TableHeader>Event ID</TableHeader>
              <TableHeader>Type</TableHeader>
              <TableHeader>Failed At</TableHeader>
              <TableHeader>Error</TableHeader>
              <TableHeader className="text-right">Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {deadLetter.map((evt, idx) => {
              const eId = evt.eventId || evt.id || `dl-${idx}`
              return (
                <TableRow key={eId}>
                  <TableCell className="font-mono text-xs">{typeof eId === 'string' ? eId.substring(0, 12) : String(eId)}</TableCell>
                  <TableCell>{evt.type || evt.action || '--'}</TableCell>
                  <TableCell className="text-zinc-500">{formatDate(evt.failedAt || evt.timestamp)}</TableCell>
                  <TableCell className="text-xs text-red-600 dark:text-red-400">{evt.error || evt.reason || '--'}</TableCell>
                  <TableCell className="text-right">
                    <Button onClick={() => handleReplayDeadLetter(eId)}>Replay</Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      ) : (
        <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No dead letter events</p>
        </div>
      )}

      {/* Submit Decision Dialog */}
      <Dialog open={showDecision} onClose={() => setShowDecision(false)} size="sm">
        <DialogTitle>Submit Approval Decision</DialogTitle>
        <DialogDescription>Approve or deny a pending request.</DialogDescription>
        <DialogBody>
          <Field>
            <Label>Decision (JSON)</Label>
            <Textarea rows={4} value={decisionPayload} onChange={(e) => setDecisionPayload(e.target.value)} placeholder='{"approvalId": "...", "decision": "approve"}' />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowDecision(false)}>Cancel</Button>
          <Button disabled={decisionLoading} onClick={handleDecision}>{decisionLoading ? 'Submitting...' : 'Submit'}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
