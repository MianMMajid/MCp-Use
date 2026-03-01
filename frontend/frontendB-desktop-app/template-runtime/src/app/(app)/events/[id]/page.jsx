'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { DescriptionDetails, DescriptionList, DescriptionTerm } from '@/components/description-list'
import { Divider } from '@/components/divider'
import { Heading, Subheading } from '@/components/heading'
import { Link } from '@/components/link'
import { ChevronLeftIcon, ClockIcon, ShieldCheckIcon } from '@heroicons/react/16/solid'
import { loadJson } from '@/lib/api'

function SkeletonDetail() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-6 flex items-center gap-4">
        <div className="h-7 w-48 rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="h-5 w-16 rounded-full bg-zinc-200 dark:bg-zinc-700" />
      </div>
      <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
        <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
              <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="mt-2 h-3 w-56 rounded bg-zinc-100 dark:bg-zinc-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function statusColor(status) {
  if (!status) return 'zinc'
  const s = status.toLowerCase()
  if (s === 'completed' || s === 'success' || s === 'active') return 'green'
  if (s === 'failed' || s === 'error') return 'red'
  if (s === 'running' || s === 'pending' || s === 'in_progress') return 'orange'
  return 'sky'
}

function riskColor(score) {
  if (score == null) return 'zinc'
  if (score >= 0.7) return 'red'
  if (score >= 0.4) return 'orange'
  return 'green'
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
      second: '2-digit',
    })
  } catch {
    return dateStr
  }
}

export default function EventDetail() {
  const { id: traceId } = useParams()
  const [trace, setTrace] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadJson(`/api/traces/${traceId}`)
        if (cancelled) return
        setTrace(data)
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('404')) {
            setNotFound(true)
          } else {
            setError(msg)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [traceId])

  if (loading) {
    return <SkeletonDetail />
  }

  if (notFound) {
    return (
      <>
        <div className="max-lg:hidden">
          <Link href="/events" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <ChevronLeftIcon className="size-4 fill-zinc-400 dark:fill-zinc-500" />
            Agents
          </Link>
        </div>
        <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Trace not found</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            The trace ID &ldquo;{traceId}&rdquo; does not exist or has expired.
          </p>
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <div className="max-lg:hidden">
          <Link href="/events" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <ChevronLeftIcon className="size-4 fill-zinc-400 dark:fill-zinc-500" />
            Agents
          </Link>
        </div>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            The gateway may be starting up or temporarily unavailable. Try refreshing the page.
          </p>
        </div>
      </>
    )
  }

  const steps = Array.isArray(trace?.steps) ? trace.steps : []
  const traceStatus = trace?.status || 'unknown'
  const riskScore = trace?.riskScore ?? trace?.risk?.score ?? null

  return (
    <>
      <div className="max-lg:hidden">
        <Link href="/events" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
          <ChevronLeftIcon className="size-4 fill-zinc-400 dark:fill-zinc-500" />
          Agents
        </Link>
      </div>
      <div className="mt-4 lg:mt-8">
        <div className="flex items-center gap-4">
          <Heading>
            {trace?.name || trace?.toolName || `Trace ${typeof traceId === 'string' ? traceId.substring(0, 12) : traceId}`}
          </Heading>
          <Badge color={statusColor(traceStatus)}>{traceStatus}</Badge>
        </div>
        <div className="isolate mt-2.5 flex flex-wrap gap-x-10 gap-y-4 py-1.5">
          <span className="flex items-center gap-3 text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white">
            <ClockIcon className="size-4 shrink-0 fill-zinc-400 dark:fill-zinc-500" />
            <span>{formatDate(trace?.startedAt || trace?.createdAt)}</span>
          </span>
          {riskScore != null && (
            <span className="flex items-center gap-3 text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white">
              <ShieldCheckIcon className="size-4 shrink-0 fill-zinc-400 dark:fill-zinc-500" />
              <span>Risk: </span>
              <Badge color={riskColor(riskScore)}>{(riskScore * 100).toFixed(0)}%</Badge>
            </span>
          )}
          {trace?.duration && (
            <span className="text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white">
              Duration: {trace.duration}
            </span>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <Subheading>Steps</Subheading>
          <p className="mt-3 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">{steps.length}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">recorded in trace</p>
        </div>
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <Subheading>Status</Subheading>
          <div className="mt-3">
            <Badge color={statusColor(traceStatus)}>{traceStatus}</Badge>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">current state</p>
        </div>
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <Subheading>Risk Score</Subheading>
          <p className="mt-3 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
            {riskScore != null ? `${(riskScore * 100).toFixed(0)}%` : '--'}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {riskScore != null ? (riskScore >= 0.7 ? 'high risk' : riskScore >= 0.4 ? 'medium risk' : 'low risk') : 'not assessed'}
          </p>
        </div>
      </div>

      <div className="mt-12">
        <Subheading>Trace Summary</Subheading>
        <Divider className="mt-4" />
        <DescriptionList>
          <DescriptionTerm>Trace ID</DescriptionTerm>
          <DescriptionDetails className="font-mono text-xs">{trace?.traceId || trace?.id || traceId}</DescriptionDetails>
          <DescriptionTerm>Agent</DescriptionTerm>
          <DescriptionDetails>{trace?.agent || trace?.actor || '--'}</DescriptionDetails>
          <DescriptionTerm>Tool</DescriptionTerm>
          <DescriptionDetails>{trace?.toolName || trace?.tool || '--'}</DescriptionDetails>
          <DescriptionTerm>Started</DescriptionTerm>
          <DescriptionDetails>{formatDate(trace?.startedAt || trace?.createdAt)}</DescriptionDetails>
          <DescriptionTerm>Completed</DescriptionTerm>
          <DescriptionDetails>{formatDate(trace?.completedAt || trace?.endedAt)}</DescriptionDetails>
          <DescriptionTerm>Duration</DescriptionTerm>
          <DescriptionDetails>{trace?.duration || '--'}</DescriptionDetails>
        </DescriptionList>
      </div>

      <div className="mt-12">
        <Subheading>Steps Timeline</Subheading>
        <Divider className="mt-4" />
        {steps.length === 0 && (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">No steps recorded for this trace.</p>
        )}
        <div className="mt-4 space-y-3">
          {steps.map((step, idx) => {
            const stepStatus = step.status || step.result || 'unknown'
            return (
              <div key={step.id || idx} className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-700">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    <span className="mr-2 text-xs text-zinc-400 dark:text-zinc-500">#{idx + 1}</span>
                    {step.toolName || step.name || step.action || `Step ${idx + 1}`}
                  </p>
                  <Badge color={statusColor(stepStatus)}>{stepStatus}</Badge>
                </div>
                {(step.reason || step.description || step.output) && (
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {step.reason || step.description || (typeof step.output === 'string' ? step.output.substring(0, 200) : '')}
                  </p>
                )}
                {step.timestamp && (
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{formatDate(step.timestamp)}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {(trace?.riskFlags || trace?.risk?.flags) && (
        <div className="mt-12">
          <Subheading>Risk Flags</Subheading>
          <Divider className="mt-4" />
          <div className="mt-4 flex flex-wrap gap-2">
            {(trace.riskFlags || trace.risk?.flags || []).map((flag, idx) => (
              <Badge key={idx} color="red">
                {typeof flag === 'string' ? flag : flag.name || flag.label || 'Flag'}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <Button href="/events">Back to Agents</Button>
        <Button outline href={`/orders/${traceId}`}>
          View Approval
        </Button>
      </div>
    </>
  )
}
