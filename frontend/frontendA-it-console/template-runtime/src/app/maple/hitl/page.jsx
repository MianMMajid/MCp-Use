'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { loadJson, postJson } from '@/lib/api'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'
import { SkeletonCard, SkeletonList } from '@/components/Skeleton'

export const sections = [
  { title: 'Pending approvals', id: 'pending-approvals' },
  { title: 'Connection', id: 'connection' },
  { title: 'Gateway HITL', id: 'gateway-hitl' },
]

/* ------------------------------------------------------------------ */
/*  Reason dialog (simple inline)                                      */
/* ------------------------------------------------------------------ */

function ReasonDialog({ onSubmit, onCancel }) {
  const [reason, setReason] = useState('')

  return (
    <div className="mt-3 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
      <label className="block text-sm font-medium text-zinc-950 dark:text-white">
        Block reason
      </label>
      <textarea
        className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Enter the reason for blocking this action..."
      />
      <div className="mt-3 flex gap-2">
        <Button
          variant="filled"
          onClick={() => onSubmit(reason)}
          disabled={!reason.trim()}
        >
          Submit block
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const MAX_APPROVALS = 500

export default function HITLQueuePage() {
  const [approvals, setApprovals] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sseStatus, setSseStatus] = useState('disconnected') // 'connected' | 'disconnected' | 'reconnecting'
  const [blockingId, setBlockingId] = useState(null)
  const [decidingIds, setDecidingIds] = useState(new Set())
  const eventSourceRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const heartbeatTimeoutRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)

  // Gateway-level HITL
  const [gwApprovals, setGwApprovals] = useState(null)
  const [gwSseStatus, setGwSseStatus] = useState('disconnected')
  const [gwBlockingId, setGwBlockingId] = useState(null)
  const [gwDecidingIds, setGwDecidingIds] = useState(new Set())
  const gwEventSourceRef = useRef(null)
  const gwReconnectTimeoutRef = useRef(null)
  const gwHeartbeatTimeoutRef = useRef(null)
  const gwReconnectAttemptsRef = useRef(0)

  /* -- Initial fetch -- */
  const fetchApprovals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadJson('/admin/api/approvals')
      setApprovals(
        Array.isArray(data) ? data : data.approvals ?? data.items ?? [],
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchApprovals()
  }, [fetchApprovals])

  /* -- Escape key closes inline block/reason dialogs -- */
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setBlockingId(null)
        setGwBlockingId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  /* -- SSE watch -- */
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
      es = new EventSource('/admin/api/approvals/watch', {
        withCredentials: true,
      })

      es.onopen = () => {
        reconnectAttemptsRef.current = 0
        setSseStatus('connected')
        resetHeartbeat()
      }

      es.onmessage = (event) => {
        resetHeartbeat()
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'new' || payload.type === 'update') {
            setApprovals((prev) => {
              if (!prev) return [payload.approval ?? payload]
              const incomingTraceId = payload.approval?.traceId ?? payload.traceId
              const incomingStepIndex = payload.approval?.stepIndex ?? payload.stepIndex
              const idx = prev.findIndex(
                (a) =>
                  a.traceId === incomingTraceId && a.stepIndex === incomingStepIndex,
              )
              const item = payload.approval ?? payload
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = item
                return next
              }
              return [item, ...prev].slice(0, MAX_APPROVALS)
            })
          } else if (payload.type === 'remove' || payload.type === 'resolved') {
            const remTraceId = payload.approval?.traceId ?? payload.traceId
            const remStepIndex = payload.approval?.stepIndex ?? payload.stepIndex
            setApprovals((prev) =>
              prev
                ? prev.filter(
                    (a) =>
                      a.traceId !== remTraceId || a.stepIndex !== remStepIndex,
                  )
                : prev,
            )
          }
        } catch {
          // non-JSON keepalive, ignore
        }
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

  /* -- Decision handlers -- */
  async function handleDecision(traceId, stepIndex, decision, reason) {
    const compositeKey = `${traceId}-${stepIndex}`
    setDecidingIds((prev) => new Set(prev).add(compositeKey))
    try {
      await postJson('/admin/api/approvals/decision', {
        traceId,
        stepIndex,
        action: decision,
        ...(reason ? { reason } : {}),
      })
      setApprovals((prev) => (prev ? prev.filter((a) => a.traceId !== traceId || a.stepIndex !== stepIndex) : prev))
      setBlockingId(null)
    } catch (err) {
      setError(`Decision failed: ${err.message}`)
    } finally {
      setDecidingIds((prev) => {
        const next = new Set(prev)
        next.delete(compositeKey)
        return next
      })
    }
  }

  /* -- Gateway HITL fetch -- */
  useEffect(() => {
    let cancelled = false
    async function fetchGw() {
      try {
        const data = await loadJson('/api/hitl/approvals')
        if (!cancelled) setGwApprovals(Array.isArray(data) ? data : data.approvals ?? data.items ?? [])
      } catch { if (!cancelled) setGwApprovals([]) }
    }
    fetchGw()
    return () => { cancelled = true }
  }, [])

  /* -- Gateway HITL SSE watch -- */
  useEffect(() => {
    const MAX_RECONNECT_ATTEMPTS = 5
    const HEARTBEAT_TIMEOUT_MS = 30000
    let es

    function resetHeartbeat() {
      clearTimeout(gwHeartbeatTimeoutRef.current)
      gwHeartbeatTimeoutRef.current = setTimeout(() => {
        if (es) {
          es.close()
          gwEventSourceRef.current = null
        }
        scheduleReconnect()
      }, HEARTBEAT_TIMEOUT_MS)
    }

    function scheduleReconnect() {
      if (gwReconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setGwSseStatus('disconnected')
        return
      }
      setGwSseStatus('reconnecting')
      gwReconnectTimeoutRef.current = setTimeout(connectGw, 5000)
    }

    function connectGw() {
      gwReconnectAttemptsRef.current += 1
      setGwSseStatus('reconnecting')
      es = new EventSource('/api/hitl/approvals/watch', { withCredentials: true })

      es.onopen = () => {
        gwReconnectAttemptsRef.current = 0
        setGwSseStatus('connected')
        resetHeartbeat()
      }

      es.onmessage = (event) => {
        resetHeartbeat()
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'new' || payload.type === 'update') {
            setGwApprovals((prev) => {
              if (!prev) return [payload.approval ?? payload]
              const tid = payload.approval?.traceId ?? payload.traceId
              const si = payload.approval?.stepIndex ?? payload.stepIndex
              const idx = prev.findIndex((a) => a.traceId === tid && a.stepIndex === si)
              const item = payload.approval ?? payload
              if (idx >= 0) { const next = [...prev]; next[idx] = item; return next }
              return [item, ...prev].slice(0, MAX_APPROVALS)
            })
          } else if (payload.type === 'remove' || payload.type === 'resolved') {
            const tid = payload.approval?.traceId ?? payload.traceId
            const si = payload.approval?.stepIndex ?? payload.stepIndex
            setGwApprovals((prev) => prev ? prev.filter((a) => a.traceId !== tid || a.stepIndex !== si) : prev)
          }
        } catch { /* keepalive */ }
      }

      es.onerror = () => {
        es.close()
        gwEventSourceRef.current = null
        clearTimeout(gwHeartbeatTimeoutRef.current)
        scheduleReconnect()
      }

      gwEventSourceRef.current = es
    }

    connectGw()

    return () => {
      clearTimeout(gwReconnectTimeoutRef.current)
      clearTimeout(gwHeartbeatTimeoutRef.current)
      if (gwEventSourceRef.current) gwEventSourceRef.current.close()
    }
  }, [])

  /* -- Gateway HITL decision -- */
  async function handleGwDecision(traceId, stepIndex, decision, reason) {
    const key = `${traceId}-${stepIndex}`
    setGwDecidingIds((prev) => new Set(prev).add(key))
    try {
      await postJson('/api/hitl/approvals/decision', { traceId, stepIndex, action: decision, ...(reason ? { reason } : {}) })
      setGwApprovals((prev) => prev ? prev.filter((a) => a.traceId !== traceId || a.stepIndex !== stepIndex) : prev)
      setGwBlockingId(null)
    } catch (err) { setError(`Gateway decision failed: ${err.message}`) }
    finally { setGwDecidingIds((prev) => { const next = new Set(prev); next.delete(key); return next }) }
  }

  const pendingCount = approvals ? approvals.length : 0

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
              HITL Approval Queue
            </h1>
            {pendingCount > 0 && (
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-orange-500 px-2 text-xs font-semibold text-white">
                {pendingCount}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Approve or block high-risk tool calls that require human review.
          </p>

          {/* Error banner */}
          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Some data could not be loaded
              </p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                The gateway may be starting up or temporarily unavailable. Try
                refreshing the page.
              </p>
            </div>
          )}

          {/* SSE connection indicator */}
          <section id="connection" className="mt-6">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  sseStatus === 'connected'
                    ? 'bg-orange-500'
                    : sseStatus === 'reconnecting'
                      ? 'animate-pulse bg-amber-500'
                      : 'bg-zinc-400'
                }`}
              />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {sseStatus === 'connected'
                  ? 'Live connection active'
                  : sseStatus === 'reconnecting'
                    ? 'Reconnecting...'
                    : 'Disconnected'}
              </span>
            </div>
          </section>

          {/* Pending approvals */}
          <section id="pending-approvals" className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Pending approvals
            </h2>

            {loading ? (
              <div className="mt-4 space-y-4">
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : approvals && approvals.length > 0 ? (
              <div className="mt-4 space-y-4">
                {approvals.map((item) => {
                  const compositeKey = `${item.traceId}-${item.stepIndex}`
                  return (
                  <div
                    key={compositeKey}
                    className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-sm font-medium text-zinc-950 dark:text-white">
                          {item.toolName ?? item.tool ?? item.action ?? 'Unknown action'}
                        </span>
                        {item.risk && (
                          <Tag
                            color={
                              item.risk === 'high'
                                ? 'rose'
                                : item.risk === 'medium'
                                  ? 'amber'
                                  : 'orange'
                            }
                            variant="medium"
                          >
                            {item.risk.toUpperCase()}
                          </Tag>
                        )}
                      </div>
                      {item.createdAt && (
                        <span className="whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      )}
                    </div>

                    {(item.description ?? item.context ?? item.input) && (
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {item.description ?? item.context ?? (typeof item.input === 'string' ? item.input : JSON.stringify(item.input))}
                      </p>
                    )}

                    {item.user && (
                      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                        User: {item.user}
                      </p>
                    )}

                    {/* Action buttons */}
                    <div className="mt-4 flex gap-2">
                      <Button
                        variant="filled"
                        onClick={() => handleDecision(item.traceId, item.stepIndex, 'allow')}
                        disabled={decidingIds.has(compositeKey)}
                      >
                        {decidingIds.has(compositeKey) ? 'Processing...' : 'Allow'}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setBlockingId(
                            blockingId === compositeKey ? null : compositeKey,
                          )
                        }
                        disabled={decidingIds.has(compositeKey)}
                      >
                        Block
                      </Button>
                    </div>

                    {/* Block reason dialog */}
                    {blockingId === compositeKey && (
                      <ReasonDialog
                        onSubmit={(reason) =>
                          handleDecision(item.traceId, item.stepIndex, 'block', reason)
                        }
                        onCancel={() => setBlockingId(null)}
                      />
                    )}
                  </div>
                  )
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No pending approvals. The queue is empty.
                </p>
              </div>
            )}
          </section>

          {/* Gateway-level HITL (GET /api/hitl/approvals, SSE /api/hitl/approvals/watch, POST /api/hitl/approvals/decision) */}
          <section id="gateway-hitl" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Gateway HITL
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Gateway-level approvals (separate from admin console approvals above).
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${gwSseStatus === 'connected' ? 'bg-orange-500' : gwSseStatus === 'reconnecting' ? 'animate-pulse bg-amber-500' : 'bg-zinc-400'}`} />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {gwSseStatus === 'connected' ? 'Gateway live connection active' : gwSseStatus === 'reconnecting' ? 'Gateway reconnecting...' : 'Gateway disconnected'}
              </span>
            </div>

            {gwApprovals && gwApprovals.length > 0 ? (
              <div className="mt-4 space-y-4">
                {gwApprovals.map((item) => {
                  const key = `${item.traceId}-${item.stepIndex}`
                  return (
                    <div key={key} className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="text-sm font-medium text-zinc-950 dark:text-white">
                            {item.toolName ?? item.tool ?? item.action ?? 'Unknown'}
                          </span>
                          {item.risk && (
                            <Tag color={item.risk === 'high' ? 'rose' : item.risk === 'medium' ? 'amber' : 'orange'} variant="medium">
                              {item.risk.toUpperCase()}
                            </Tag>
                          )}
                        </div>
                        {item.createdAt && <span className="whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">{new Date(item.createdAt).toLocaleString()}</span>}
                      </div>
                      {(item.description ?? item.context ?? item.input) && (
                        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                          {item.description ?? item.context ?? (typeof item.input === 'string' ? item.input : JSON.stringify(item.input))}
                        </p>
                      )}
                      <div className="mt-4 flex gap-2">
                        <Button variant="filled" onClick={() => handleGwDecision(item.traceId, item.stepIndex, 'allow')} disabled={gwDecidingIds.has(key)}>
                          {gwDecidingIds.has(key) ? 'Processing...' : 'Allow'}
                        </Button>
                        <Button variant="secondary" onClick={() => setGwBlockingId(gwBlockingId === key ? null : key)} disabled={gwDecidingIds.has(key)}>
                          Block
                        </Button>
                      </div>
                      {gwBlockingId === key && (
                        <ReasonDialog onSubmit={(reason) => handleGwDecision(item.traceId, item.stepIndex, 'block', reason)} onCancel={() => setGwBlockingId(null)} />
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No gateway-level pending approvals.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
