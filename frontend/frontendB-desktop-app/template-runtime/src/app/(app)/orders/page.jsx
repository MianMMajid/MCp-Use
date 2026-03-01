'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson } from '@/lib/api'

function SkeletonRows() {
  return (
    <div className="mt-8 animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
            <div className="flex items-center justify-between">
              <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-5 w-16 rounded-full bg-zinc-200 dark:bg-zinc-700" />
            </div>
            <div className="mt-2 h-3 w-56 rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  )
}

function decisionColor(decision) {
  if (!decision) return 'orange'
  const d = decision.toLowerCase()
  if (d === 'allow' || d === 'allowed' || d === 'approved') return 'green'
  if (d === 'block' || d === 'blocked' || d === 'denied') return 'red'
  if (d === 'pending') return 'orange'
  return 'zinc'
}

function formatDate(dateStr) {
  if (!dateStr) return '--'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

export default function Orders() {
  const [approvals, setApprovals] = useState(null)
  const [count, setCount] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  function fetchApprovals() {
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const data = await loadJson('/api/hitl/approvals')
        if (cancelled) return
        setApprovals(Array.isArray(data?.approvals) ? data.approvals : [])
        setCount(data?.count ?? 0)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setApprovals([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }

  useEffect(() => {
    return fetchApprovals()
  }, [])

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Approvals</Heading>
        <Button className="-my-0.5" onClick={() => fetchApprovals()}>
          Refresh queue
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            The gateway may be starting up or temporarily unavailable. Try refreshing the page.
          </p>
        </div>
      )}

      {loading && <SkeletonRows />}

      {!loading && approvals && approvals.length === 0 && !error && (
        <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No pending approvals</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            When agents request human-in-the-loop decisions, they will appear here.
          </p>
        </div>
      )}

      {!loading && approvals && approvals.length > 0 && (
        <>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{count} approval request{count !== 1 ? 's' : ''}</p>
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Trace ID</TableHeader>
                <TableHeader>Requested</TableHeader>
                <TableHeader>Tool / Step</TableHeader>
                <TableHeader>Actor</TableHeader>
                <TableHeader className="text-right">Decision</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {approvals.map((approval, idx) => {
                const traceId = approval.traceId || approval.requestId || approval.id || `row-${idx}`
                const traceIdShort = typeof traceId === 'string' ? traceId.substring(0, 12) : String(traceId)
                const decision = approval.pendingDecision || approval.decision || approval.status || 'pending'

                return (
                  <TableRow key={traceId} href={`/orders/${traceId}`} title={`Approval ${traceIdShort}`}>
                    <TableCell className="font-mono text-xs">{traceIdShort}</TableCell>
                    <TableCell className="text-zinc-500">{formatDate(approval.requestedAt || approval.createdAt)}</TableCell>
                    <TableCell>{approval.toolName || approval.step || approval.action || '--'}</TableCell>
                    <TableCell>{approval.actor || approval.agent || '--'}</TableCell>
                    <TableCell className="text-right">
                      <Badge color={decisionColor(decision)}>{decision}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </>
      )}
    </>
  )
}
