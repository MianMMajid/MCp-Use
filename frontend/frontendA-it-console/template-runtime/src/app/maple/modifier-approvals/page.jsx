'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { loadJson, postJson } from '@/lib/api'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'
import { SkeletonCard, SkeletonList } from '@/components/Skeleton'

export const sections = [
  { title: 'Capabilities', id: 'capabilities' },
  { title: 'Pending approvals', id: 'pending-approvals' },
  { title: 'Connection', id: 'connection' },
  { title: 'Execute', id: 'execute' },
]

function formatDate(d) {
  if (!d) return '--'
  try { return new Date(d).toLocaleString() } catch { return d }
}

function ReasonDialog({ onSubmit, onCancel }) {
  const [reason, setReason] = useState('')
  return (
    <div className="mt-3 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
      <label className="block text-sm font-medium text-zinc-950 dark:text-white">Reason</label>
      <textarea className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-white" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Enter reason..." />
      <div className="mt-3 flex gap-2">
        <Button variant="filled" onClick={() => onSubmit(reason)} disabled={!reason.trim()}>Submit</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

const MAX_APPROVALS = 500

export default function ModifierApprovalsPage() {
  const [capabilities, setCapabilities] = useState(null)
  const [approvals, setApprovals] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState('')
  const [sseStatus, setSseStatus] = useState('disconnected')
  const [decidingIds, setDecidingIds] = useState(new Set())
  const [reasoningId, setReasoningId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const eventSourceRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const heartbeatTimeoutRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)

  // Execute form
  const [execPayload, setExecPayload] = useState('')
  const [execResult, setExecResult] = useState(null)
  const [execLoading, setExecLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, a] = await Promise.allSettled([
        loadJson('/api/openclaw/modifier/capabilities'),
        loadJson('/api/openclaw/modifier/approvals'),
      ])
      if (c.status === 'fulfilled') setCapabilities(c.value)
      if (a.status === 'fulfilled') setApprovals(Array.isArray(a.value?.approvals) ? a.value.approvals : Array.isArray(a.value) ? a.value : [])
      if (c.status === 'rejected' && a.status === 'rejected') throw new Error('All endpoints failed')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // SSE watch
  useEffect(() => {
    const MAX_RECONNECT_ATTEMPTS = 5
    const HEARTBEAT_TIMEOUT_MS = 30000
    let es

    function resetHeartbeat() {
      clearTimeout(heartbeatTimeoutRef.current)
      heartbeatTimeoutRef.current = setTimeout(() => {
        // No message received within 30s — close and reconnect
        if (es) {
          es.close()
          eventSourceRef.current = null
        }
        scheduleReconnect()
      }, HEARTBEAT_TIMEOUT_MS)
    }

    function scheduleReconnect() {
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setSseStatus('disconnected')
        return
      }
      setSseStatus('reconnecting')
      reconnectTimeoutRef.current = setTimeout(connect, 5000)
    }

    function connect() {
      reconnectAttemptsRef.current += 1
      setSseStatus('reconnecting')
      es = new EventSource('/api/openclaw/modifier/approvals/watch', { withCredentials: true })

      es.onopen = () => {
        reconnectAttemptsRef.current = 0
        setSseStatus('connected')
        resetHeartbeat()
      }

      es.onmessage = (event) => {
        resetHeartbeat()
        try {
          const payload = JSON.parse(event.data)
          if (payload.eventType === 'new' || payload.eventType === 'update') {
            setApprovals((prev) => {
              if (!prev) return [payload]
              const idx = prev.findIndex((a) => a.approvalId === payload.approvalId)
              if (idx >= 0) { const next = [...prev]; next[idx] = payload; return next }
              return [payload, ...prev].slice(0, MAX_APPROVALS)
            })
          } else if (payload.eventType === 'resolved' || payload.eventType === 'remove') {
            setApprovals((prev) => prev ? prev.filter((a) => a.approvalId !== payload.approvalId) : prev)
          }
        } catch { /* keepalive */ }
      }

      es.onerror = () => {
        es.close()
        eventSourceRef.current = null
        clearTimeout(heartbeatTimeoutRef.current)
        scheduleReconnect()
      }

      eventSourceRef.current = es
    }

    connect()

    return () => {
      clearTimeout(reconnectTimeoutRef.current)
      clearTimeout(heartbeatTimeoutRef.current)
      if (eventSourceRef.current) eventSourceRef.current.close()
    }
  }, [])

  async function handleDecision(approvalId, action, reason) {
    setDecidingIds((prev) => new Set(prev).add(approvalId))
    try {
      await postJson(`/api/openclaw/modifier/approvals/${encodeURIComponent(approvalId)}/decision`, { action, ...(reason ? { reason } : {}) })
      setApprovals((prev) => prev ? prev.filter((a) => a.approvalId !== approvalId) : prev)
      setReasoningId(null)
      setMessage(`Decision submitted: ${action}`)
    } catch (err) { setMessage(`Decision failed: ${err.message}`) }
    finally {
      setDecidingIds((prev) => { const next = new Set(prev); next.delete(approvalId); return next })
    }
  }

  async function handleStepUpDecide(approvalId, action, reason, challengeToken) {
    setDecidingIds((prev) => new Set(prev).add(approvalId))
    try {
      await postJson('/api/openclaw/modifier/approvals/step-up-decide', { approvalId, action, reason, challengeToken })
      setApprovals((prev) => prev ? prev.filter((a) => a.approvalId !== approvalId) : prev)
      setReasoningId(null)
      setMessage('Step-up decision submitted')
    } catch (err) { setMessage(`Step-up decision failed: ${err.message}`) }
    finally {
      setDecidingIds((prev) => { const next = new Set(prev); next.delete(approvalId); return next })
    }
  }

  async function toggleDetail(approvalId) {
    if (expandedId === approvalId) { setExpandedId(null); setDetail(null); return }
    setExpandedId(approvalId)
    try {
      const data = await loadJson(`/api/openclaw/modifier/approvals/${encodeURIComponent(approvalId)}`)
      setDetail(data)
    } catch { setDetail(null) }
  }

  async function handleExec() {
    setExecLoading(true)
    setExecResult(null)
    try {
      let body = {}
      if (execPayload.trim()) { try { body = JSON.parse(execPayload) } catch { body = { raw: execPayload } } }
      const data = await postJson('/api/openclaw/modifier/exec', body)
      setExecResult(data)
    } catch (err) { setExecResult({ error: err.message }) }
    finally { setExecLoading(false) }
  }

  const pendingCount = approvals ? approvals.length : 0

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Modifier Approvals</h1>
            {pendingCount > 0 && (
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-orange-500 px-2 text-xs font-semibold text-white">{pendingCount}</span>
            )}
          </div>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Review modifier approval requests, manage capabilities, and execute modifier operations.</p>

          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
            </div>
          )}
          {message && <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300">{message}</p>}

          {/* Capabilities */}
          <section id="capabilities" className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Capabilities</h2>
            {loading ? <div className="mt-4"><SkeletonCard /></div> : capabilities ? (
              <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                <pre className="overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(capabilities, null, 2)}</pre>
              </div>
            ) : null}
          </section>

          {/* SSE connection */}
          <section id="connection" className="mt-6">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${sseStatus === 'connected' ? 'bg-orange-500' : sseStatus === 'reconnecting' ? 'animate-pulse bg-amber-500' : 'bg-zinc-400'}`} />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {sseStatus === 'connected' ? 'Live connection active' : sseStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
              </span>
            </div>
          </section>

          {/* Pending Approvals */}
          <section id="pending-approvals" className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Pending approvals</h2>
              <Button variant="secondary" onClick={fetchData}>Refresh</Button>
            </div>
            {loading ? (
              <div className="mt-4"><SkeletonList /></div>
            ) : approvals && approvals.length > 0 ? (
              <div className="mt-4 space-y-4">
                {approvals.map((item) => {
                  const aid = item.approvalId || item.id || ''
                  return (
                    <div key={aid} className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <button type="button" onClick={() => toggleDetail(aid)} className="text-sm font-medium text-zinc-950 hover:underline dark:text-white">
                            {item.toolName || item.action || item.type || 'Approval Request'}
                          </button>
                          {item.risk && <Tag className="ml-2" color={item.risk === 'high' || item.risk === 'critical' ? 'rose' : item.risk === 'medium' ? 'amber' : 'orange'} variant="medium">{item.risk}</Tag>}
                          {item.status && <Tag className="ml-2" color={item.status === 'pending' ? 'amber' : 'zinc'} variant="small">{item.status}</Tag>}
                        </div>
                        <span className="text-xs text-zinc-500">{formatDate(item.requestedAt || item.createdAt)}</span>
                      </div>
                      {item.requestedBy && <p className="mt-1 text-xs text-zinc-400">Requested by: {item.requestedBy}</p>}
                      {(item.description || item.context) && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{item.description || (typeof item.context === 'string' ? item.context : JSON.stringify(item.context))}</p>}

                      {expandedId === aid && detail && (
                        <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{JSON.stringify(detail, null, 2)}</pre>
                      )}

                      <div className="mt-4 flex gap-2">
                        <Button variant="filled" onClick={() => handleDecision(aid, 'approve')} disabled={decidingIds.has(aid)}>
                          {decidingIds.has(aid) ? 'Processing...' : 'Approve'}
                        </Button>
                        <Button variant="secondary" onClick={() => setReasoningId(reasoningId === aid ? null : aid)} disabled={decidingIds.has(aid)}>
                          Reject
                        </Button>
                      </div>

                      {reasoningId === aid && (
                        <ReasonDialog onSubmit={(reason) => handleDecision(aid, 'reject', reason)} onCancel={() => setReasoningId(null)} />
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No pending modifier approvals.</p>
              </div>
            )}
          </section>

          {/* Execute */}
          <section id="execute" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Execute</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Execute a modifier request directly.</p>
            <textarea className="mt-4 w-full rounded-xl border border-zinc-950/10 bg-white px-4 py-3 font-mono text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-white" rows={4} value={execPayload} onChange={(e) => setExecPayload(e.target.value)} placeholder='{"toolName": "...", "input": {}}' />
            <div className="mt-3">
              <Button variant="filled" onClick={handleExec} disabled={execLoading}>
                {execLoading ? 'Executing...' : 'Execute'}
              </Button>
            </div>
            {execResult && (
              <div className="mt-4 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(execResult, null, 2)}</pre>
              </div>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
