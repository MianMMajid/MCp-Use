'use client'

import { Fragment, useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { Link } from '@/components/link'
import { Select } from '@/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'
import { SkeletonRows } from '@/components/skeleton'

function asItems(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  return []
}

function shortId(value) {
  if (!value) return '--'
  const text = String(value)
  return text.length <= 12 ? text : text.slice(0, 12)
}

export default function RunsPage() {
  const [runs, setRuns] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedId, setExpandedId] = useState('')
  const [expandedGraph, setExpandedGraph] = useState(null)
  const [expandedTimeline, setExpandedTimeline] = useState(null)
  const [expandedLoading, setExpandedLoading] = useState(false)

  async function fetchRuns() {
    setLoading(true)
    setError('')
    try {
      const data = await loadJson('/api/orchestrations/executions?limit=100')
      setRuns(asItems(data))
    } catch (err) {
      setRuns([])
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRuns().catch(() => {})
  }, [])

  async function toggleExpanded(executionId) {
    if (expandedId === executionId) {
      setExpandedId('')
      setExpandedGraph(null)
      setExpandedTimeline(null)
      return
    }
    setExpandedId(executionId)
    setExpandedLoading(true)
    try {
      const [graphData, timelineData] = await Promise.all([
        loadJson(`/api/orchestrations/executions/${executionId}/graph`).catch(() => null),
        loadJson(`/api/orchestrations/executions/${executionId}/timeline?limit=30`).catch(() => null),
      ])
      setExpandedGraph(graphData?.nodes ? graphData : null)
      setExpandedTimeline(asItems(timelineData?.timeline ? timelineData.timeline : timelineData))
    } finally {
      setExpandedLoading(false)
    }
  }

  const filteredRuns = (runs || []).filter((run) => {
    if (statusFilter === 'all') return true
    return String(run.status || '').toLowerCase() === statusFilter
  })

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-end justify-between gap-4">
          <Heading>Orchestration Executions</Heading>
          <Button onClick={fetchRuns}>Refresh</Button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Unable to load execution list</p>
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{error}</p>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Status:</span>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
            <option value="all">All</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="waiting_approval">Waiting Approval</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="canceled">Canceled</option>
          </Select>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {filteredRuns.length} execution{filteredRuns.length === 1 ? '' : 's'}
          </span>
        </div>

        {loading && <SkeletonRows />}

        {!loading && filteredRuns.length === 0 && (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No executions yet.</p>
          </div>
        )}

        {!loading && filteredRuns.length > 0 && (
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Execution ID</TableHeader>
                <TableHeader>Orchestration</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Mode</TableHeader>
                <TableHeader>Started</TableHeader>
                <TableHeader>Completed</TableHeader>
                <TableHeader className="text-right">Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRuns.map((run) => {
                const executionId = run.executionId || run.id || ''
                const expanded = executionId === expandedId
                return (
                  <Fragment key={executionId}>
                    <TableRow key={executionId} className="cursor-pointer" onClick={() => toggleExpanded(executionId)}>
                      <TableCell className="font-mono text-xs">{shortId(executionId)}</TableCell>
                      <TableCell className="font-mono text-xs">{shortId(run.orchestrationId)}</TableCell>
                      <TableCell><Badge color={statusColor(run.status || 'unknown')}>{run.status || 'unknown'}</Badge></TableCell>
                      <TableCell>{run.mode || '--'}</TableCell>
                      <TableCell className="text-zinc-500">{formatDate(run.startedAt || run.createdAt)}</TableCell>
                      <TableCell className="text-zinc-500">{formatDate(run.completedAt)}</TableCell>
                      <TableCell className="text-right">
                        <Link href={`/runs/${executionId}`} className="text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
                          View
                        </Link>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow key={`${executionId}-expanded`}>
                        <TableCell colSpan={7}>
                          {expandedLoading ? (
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading execution snapshot...</p>
                          ) : (
                            <div className="space-y-3 py-2">
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Runtime graph: {(expandedGraph?.nodes || []).length} nodes, {(expandedGraph?.edges || []).length} edges
                              </p>
                              <div className="max-h-40 space-y-1 overflow-auto">
                                {(expandedTimeline || []).map((event, idx) => (
                                  <div key={event.id || idx} className="flex items-center gap-2 text-xs">
                                    <Badge color={statusColor(event.eventType || 'unknown')}>{event.eventType || 'event'}</Badge>
                                    <span className="text-zinc-500">{formatDate(event.timestamp)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
