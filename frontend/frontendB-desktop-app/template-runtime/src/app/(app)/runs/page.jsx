'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'
import { SkeletonRows } from '@/components/skeleton'

export default function RunsPage() {
  const [runs, setRuns] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [detail, setDetail] = useState(null)
  const [timeline, setTimeline] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  function fetchRuns() {
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const data = await loadJson('/api/runs')
        if (cancelled) return
        setRuns(Array.isArray(data?.runs) ? data.runs : Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [])
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setRuns([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }

  useEffect(() => {
    return fetchRuns()
  }, [])

  async function toggleExpand(runId) {
    if (expanded === runId) {
      setExpanded(null)
      setDetail(null)
      setTimeline(null)
      return
    }
    setExpanded(runId)
    setDetailLoading(true)
    try {
      const [d, t] = await Promise.all([
        loadJson(`/api/runs/${runId}`).catch(() => null),
        loadJson(`/api/runs/${runId}/timeline`).catch(() => null),
      ])
      setDetail(d)
      setTimeline(Array.isArray(t?.events) ? t.events : Array.isArray(t) ? t : [])
    } catch {
      setDetail(null)
      setTimeline([])
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Runs</Heading>
        <Button className="-my-0.5" onClick={() => fetchRuns()}>Refresh</Button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">The gateway may be starting up or temporarily unavailable.</p>
        </div>
      )}

      {loading && <SkeletonRows />}

      {!loading && runs && runs.length === 0 && !error && (
        <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No runs yet</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">When agent runs are created, they will appear here.</p>
        </div>
      )}

      {!loading && runs && runs.length > 0 && (
        <>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{runs.length} run{runs.length !== 1 ? 's' : ''}</p>
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Run ID</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Started</TableHeader>
                <TableHeader>Agent</TableHeader>
                <TableHeader>Duration</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.map((run) => {
                const runId = run.runId || run.id || ''
                const shortId = typeof runId === 'string' ? runId.substring(0, 12) : String(runId)
                const status = run.status || 'unknown'
                const isExpanded = expanded === runId

                return (
                  <>
                    <TableRow
                      key={runId}
                      className="cursor-pointer"
                      onClick={() => toggleExpand(runId)}
                      title={`Run ${shortId}`}
                    >
                      <TableCell className="font-mono text-xs">{shortId}</TableCell>
                      <TableCell><Badge color={statusColor(status)}>{status}</Badge></TableCell>
                      <TableCell className="text-zinc-500">{formatDate(run.startedAt || run.createdAt)}</TableCell>
                      <TableCell>{run.agentName || run.agent || '--'}</TableCell>
                      <TableCell>{run.duration || '--'}</TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${runId}-detail`}>
                        <TableCell colSpan={5}>
                          {detailLoading ? (
                            <p className="animate-pulse text-sm text-zinc-500">Loading details...</p>
                          ) : (
                            <div className="space-y-4 py-2">
                              {detail && (
                                <div>
                                  <Subheading>Run Detail</Subheading>
                                  <pre className="mt-2 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                    {JSON.stringify(detail, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {timeline && timeline.length > 0 && (
                                <div>
                                  <Subheading>Timeline</Subheading>
                                  <ul className="mt-2 space-y-2">
                                    {timeline.map((evt, i) => (
                                      <li key={i} className="flex items-start gap-2 text-xs">
                                        <Badge color={statusColor(evt.type || evt.status)}>{evt.type || evt.event || 'event'}</Badge>
                                        <span className="text-zinc-600 dark:text-zinc-400">
                                          {evt.message || evt.description || evt.name || JSON.stringify(evt)}
                                        </span>
                                        <span className="ml-auto text-zinc-400">{formatDate(evt.timestamp || evt.at)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                )
              })}
            </TableBody>
          </Table>
        </>
      )}
    </>
  )
}
