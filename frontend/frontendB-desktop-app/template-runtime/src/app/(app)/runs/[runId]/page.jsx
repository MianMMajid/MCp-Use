'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { DescriptionDetails, DescriptionList, DescriptionTerm } from '@/components/description-list'
import { Divider } from '@/components/divider'
import { Heading, Subheading } from '@/components/heading'
import { Link } from '@/components/link'
import { ChevronLeftIcon } from '@heroicons/react/16/solid'
import { loadJson } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'
import { SkeletonDetail } from '@/components/skeleton'

export default function ExecutionDetailPage() {
  const { runId } = useParams()
  const [execution, setExecution] = useState(null)
  const [graph, setGraph] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showRawJson, setShowRawJson] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [executionData, graphData, timelineData] = await Promise.all([
          loadJson(`/api/orchestrations/executions/${runId}`),
          loadJson(`/api/orchestrations/executions/${runId}/graph`).catch(() => null),
          loadJson(`/api/orchestrations/executions/${runId}/timeline?limit=200`).catch(() => null),
        ])
        if (cancelled) return
        setExecution(executionData?.execution ?? executionData)
        setGraph(graphData)
        const items = Array.isArray(timelineData?.timeline)
          ? timelineData.timeline
          : Array.isArray(timelineData?.items)
            ? timelineData.items
            : Array.isArray(timelineData)
              ? timelineData
              : []
        setTimeline(items)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [runId])

  if (loading) return <SkeletonDetail />

  if (error) {
    return (
      <>
        <div className="max-lg:hidden">
          <Link href="/runs" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <ChevronLeftIcon className="size-4 fill-zinc-400 dark:fill-zinc-500" />
            Runs
          </Link>
        </div>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Failed to load execution detail</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{error}</p>
        </div>
      </>
    )
  }

  const status = execution?.status || 'unknown'
  const runtimeNodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const runtimeEdges = Array.isArray(graph?.edges) ? graph.edges : []
  const approvals = Array.isArray(graph?.approvals) ? graph.approvals : []

  return (
    <>
      <div className="max-lg:hidden">
        <Link href="/runs" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
          <ChevronLeftIcon className="size-4 fill-zinc-400 dark:fill-zinc-500" />
          Runs
        </Link>
      </div>
      <div className="mt-4 lg:mt-8">
        <div className="flex items-center gap-4">
          <Heading>Execution {typeof runId === 'string' ? runId.slice(0, 12) : runId}</Heading>
          <Badge color={statusColor(status)}>{status}</Badge>
        </div>
      </div>

      <div className="mt-10">
        <Subheading>Execution Metadata</Subheading>
        <Divider className="mt-4" />
        <DescriptionList>
          <DescriptionTerm>Execution ID</DescriptionTerm>
          <DescriptionDetails className="font-mono text-xs">{execution?.executionId || runId}</DescriptionDetails>
          <DescriptionTerm>Orchestration ID</DescriptionTerm>
          <DescriptionDetails className="font-mono text-xs">{execution?.orchestrationId || '--'}</DescriptionDetails>
          <DescriptionTerm>Mode</DescriptionTerm>
          <DescriptionDetails>{execution?.mode || '--'}</DescriptionDetails>
          <DescriptionTerm>Requested By</DescriptionTerm>
          <DescriptionDetails>{execution?.requestedBy || '--'}</DescriptionDetails>
          <DescriptionTerm>Created</DescriptionTerm>
          <DescriptionDetails>{formatDate(execution?.createdAt)}</DescriptionDetails>
          <DescriptionTerm>Started</DescriptionTerm>
          <DescriptionDetails>{formatDate(execution?.startedAt)}</DescriptionDetails>
          <DescriptionTerm>Completed</DescriptionTerm>
          <DescriptionDetails>{formatDate(execution?.completedAt)}</DescriptionDetails>
        </DescriptionList>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <p className="text-xs text-zinc-500">Runtime Graph</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{runtimeNodes.length}</p>
          <p className="text-xs text-zinc-500">nodes</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <p className="text-xs text-zinc-500">Edges</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{runtimeEdges.length}</p>
          <p className="text-xs text-zinc-500">active graph edges</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <p className="text-xs text-zinc-500">Approvals</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{approvals.length}</p>
          <p className="text-xs text-zinc-500">approval records</p>
        </div>
      </div>

      {timeline.length > 0 && (
        <div className="mt-10">
          <Subheading>Timeline</Subheading>
          <Divider className="mt-4" />
          <div className="mt-4 max-h-[32rem] space-y-2 overflow-auto rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            {timeline.map((event, idx) => (
              <div key={event.id || idx} className="flex items-center gap-2 text-xs">
                <Badge color={statusColor(event.eventType || 'unknown')}>{event.eventType || 'event'}</Badge>
                <span className="text-zinc-500">{formatDate(event.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10">
        <button
          onClick={() => setShowRawJson((v) => !v)}
          className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          {showRawJson ? 'Hide Raw JSON' : 'Show Raw JSON'}
        </button>
        {showRawJson && (
          <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-zinc-50 p-4 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {JSON.stringify({ execution, graph, timeline }, null, 2)}
          </pre>
        )}
      </div>

      <div className="mt-8">
        <Button href="/runs">Back to Runs</Button>
      </div>
    </>
  )
}
