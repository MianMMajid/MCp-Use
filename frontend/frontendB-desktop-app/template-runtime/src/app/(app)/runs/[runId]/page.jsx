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

export default function RunDetail() {
  const { runId } = useParams()
  const [run, setRun] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [runData, timelineData] = await Promise.all([
          loadJson(`/api/openclaw/runs/${runId}`),
          loadJson(`/api/openclaw/runs/${runId}/timeline`).catch(() => ({ timeline: [] })),
        ])
        if (cancelled) return
        setRun(runData)
        setTimeline(timelineData?.timeline ?? [])
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
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Failed to load run details</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{error}</p>
        </div>
      </>
    )
  }

  const runStatus = run?.status ?? 'unknown'

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
          <Heading>Run {typeof runId === 'string' ? runId.slice(0, 8) : runId}</Heading>
          <Badge color={statusColor(runStatus)}>{runStatus}</Badge>
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <Subheading>Type</Subheading>
          <p className="mt-3 text-lg font-semibold text-zinc-950 dark:text-zinc-100">{run?.type ?? '--'}</p>
        </div>
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <Subheading>Session</Subheading>
          <p className="mt-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">{run?.sessionId ?? '--'}</p>
        </div>
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <Subheading>Cost</Subheading>
          <p className="mt-3 text-lg font-semibold text-zinc-950 dark:text-zinc-100">
            {run?.cost ? `$${run.cost.estimatedCostUsd.toFixed(4)}` : '--'}
          </p>
          {run?.cost && (
            <p className="text-xs text-zinc-500">{run.cost.inputTokens} in / {run.cost.outputTokens} out</p>
          )}
        </div>
      </div>

      <div className="mt-12">
        <Subheading>Run Metadata</Subheading>
        <Divider className="mt-4" />
        <DescriptionList>
          <DescriptionTerm>Run ID</DescriptionTerm>
          <DescriptionDetails className="font-mono text-xs">{run?.runId ?? runId}</DescriptionDetails>
          <DescriptionTerm>Created</DescriptionTerm>
          <DescriptionDetails>{formatDate(run?.createdAt)}</DescriptionDetails>
          <DescriptionTerm>Updated</DescriptionTerm>
          <DescriptionDetails>{formatDate(run?.updatedAt)}</DescriptionDetails>
          {run?.error && (
            <>
              <DescriptionTerm>Error</DescriptionTerm>
              <DescriptionDetails className="text-red-600">{run.error}</DescriptionDetails>
            </>
          )}
        </DescriptionList>
      </div>

      {timeline.length > 0 && (
        <div className="mt-12">
          <Subheading>Timeline</Subheading>
          <Divider className="mt-4" />
          <div className="mt-4 space-y-3">
            {timeline.map((event, idx) => (
              <div key={event.id || idx} className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-700">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{event.eventType}</p>
                  <p className="text-xs text-zinc-400">{formatDate(event.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <Button href="/runs">Back to Runs</Button>
      </div>
    </>
  )
}
