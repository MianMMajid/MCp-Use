'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Pending approvals', id: 'pending-approvals' },
  { title: 'Connection', id: 'connection' },
]

/* ------------------------------------------------------------------ */
/*  Fetch helpers                                                      */
/* ------------------------------------------------------------------ */

async function loadJson(path) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

/* ------------------------------------------------------------------ */
/*  Skeletons                                                          */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 h-8 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-2 h-3 w-32 rounded bg-zinc-100 dark:bg-zinc-800" />
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700"
          >
            <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="mt-2 h-3 w-56 rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  )
}

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

export default function HITLQueuePage() {
  const [approvals, setApprovals] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sseStatus, setSseStatus] = useState('disconnected') // 'connected' | 'disconnected' | 'reconnecting'
  const [blockingId, setBlockingId] = useState(null)
  const [decidingIds, setDecidingIds] = useState(new Set())
  const eventSourceRef = useRef(null)

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

  /* -- SSE watch -- */
  useEffect(() => {
    let es

    function connect() {
      setSseStatus('reconnecting')
      es = new EventSource('/admin/api/approvals/watch', {
        withCredentials: true,
      })

      es.onopen = () => setSseStatus('connected')

      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'new' || payload.type === 'update') {
            setApprovals((prev) => {
              if (!prev) return [payload.approval ?? payload]
              const idx = prev.findIndex(
                (a) =>
                  a.id === (payload.approval?.id ?? payload.id),
              )
              const item = payload.approval ?? payload
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = item
                return next
              }
              return [item, ...prev]
            })
          } else if (payload.type === 'remove' || payload.type === 'resolved') {
            setApprovals((prev) =>
              prev
                ? prev.filter(
                    (a) =>
                      a.id !== (payload.approval?.id ?? payload.id),
                  )
                : prev,
            )
          }
        } catch {
          // non-JSON keepalive, ignore
        }
      }

      es.onerror = () => {
        setSseStatus('reconnecting')
        es.close()
        setTimeout(connect, 5000)
      }

      eventSourceRef.current = es
    }

    connect()

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close()
    }
  }, [])

  /* -- Decision handlers -- */
  async function handleDecision(id, decision, reason) {
    setDecidingIds((prev) => new Set(prev).add(id))
    try {
      await postJson('/admin/api/approvals/decision', {
        id,
        decision,
        ...(reason ? { reason } : {}),
      })
      setApprovals((prev) => (prev ? prev.filter((a) => a.id !== id) : prev))
      setBlockingId(null)
    } catch (err) {
      setError(`Decision failed: ${err.message}`)
    } finally {
      setDecidingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
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
                {approvals.map((item) => (
                  <div
                    key={item.id}
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
                        onClick={() => handleDecision(item.id, 'allow')}
                        disabled={decidingIds.has(item.id)}
                      >
                        {decidingIds.has(item.id) ? 'Processing...' : 'Allow'}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setBlockingId(
                            blockingId === item.id ? null : item.id,
                          )
                        }
                        disabled={decidingIds.has(item.id)}
                      >
                        Block
                      </Button>
                    </div>

                    {/* Block reason dialog */}
                    {blockingId === item.id && (
                      <ReasonDialog
                        onSubmit={(reason) =>
                          handleDecision(item.id, 'block', reason)
                        }
                        onCancel={() => setBlockingId(null)}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No pending approvals. The queue is empty.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
