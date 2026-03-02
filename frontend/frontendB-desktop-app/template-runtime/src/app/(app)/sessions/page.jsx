'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, postJson, invalidateCache } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'
import { SkeletonRows } from '@/components/skeleton'

export default function SessionsPage() {
  const [sessions, setSessions] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(null)

  function fetchSessions(nextCursor) {
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const params = new URLSearchParams()
        if (nextCursor) params.set('cursor', nextCursor)
        const qs = params.toString()
        const data = await loadJson(`/api/openclaw/agent/sessions${qs ? `?${qs}` : ''}`)
        if (cancelled) return
        const items = Array.isArray(data?.sessions) ? data.sessions : Array.isArray(data?.items) ? data.items : []
        const MAX_SESSIONS = 1000
        setSessions((prev) => {
          const merged = nextCursor && prev ? [...prev, ...items] : items
          return merged.slice(-MAX_SESSIONS)
        })
        setCursor(data?.nextCursor || data?.cursor || null)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          if (!nextCursor) setSessions([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }

  useEffect(() => {
    return fetchSessions()
  }, [])

  async function handleCancel(sessionId) {
    setCancelling(sessionId)
    try {
      await postJson(`/api/openclaw/agent/sessions/${sessionId}/cancel`, {})
      invalidateCache('/api/openclaw/agent/sessions')
      fetchSessions()
    } catch {
      // refresh anyway
      fetchSessions()
    } finally {
      setCancelling(null)
    }
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Agent Sessions</Heading>
        <Button className="-my-0.5" onClick={() => fetchSessions()}>
          Refresh
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

      {loading && !sessions && <SkeletonRows />}

      {!loading && sessions && sessions.length === 0 && !error && (
        <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No agent sessions</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            When agents start sessions, they will appear here.
          </p>
        </div>
      )}

      {sessions && sessions.length > 0 && (
        <>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </p>
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Session ID</TableHeader>
                <TableHeader>Started</TableHeader>
                <TableHeader>Agent</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader className="text-right">Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {sessions.map((session) => {
                const sessionId = session.sessionId || session.id || ''
                const shortId = typeof sessionId === 'string' ? sessionId.substring(0, 12) : String(sessionId)
                const status = session.status || 'unknown'

                return (
                  <TableRow key={sessionId} href={`/sessions/${sessionId}`} title={`Session ${shortId}`}>
                    <TableCell className="font-mono text-xs">{shortId}</TableCell>
                    <TableCell className="text-zinc-500">{formatDate(session.startedAt || session.createdAt)}</TableCell>
                    <TableCell>{session.agentName || session.agent || '--'}</TableCell>
                    <TableCell>
                      <Badge color={statusColor(status)}>{status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {(status === 'running' || status === 'in_progress' || status === 'active') && (
                        <Button
                          color="red"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleCancel(sessionId)
                          }}
                          disabled={cancelling === sessionId}
                        >
                          {cancelling === sessionId ? 'Cancelling...' : 'Cancel'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {cursor && (
            <div className="mt-4 text-center">
              <Button outline onClick={() => fetchSessions(cursor)} disabled={loading}>
                {loading ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}
