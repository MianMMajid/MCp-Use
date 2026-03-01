'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson } from '@/lib/api'

function SkeletonRows() {
  return (
    <div className="mt-8 animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded bg-zinc-100 dark:bg-zinc-800" />
        ))}
      </div>
    </div>
  )
}

function riskColor(score) {
  if (score == null) return 'zinc'
  if (typeof score === 'string') {
    const s = score.toLowerCase()
    if (s === 'high' || s === 'critical') return 'red'
    if (s === 'medium') return 'orange'
    if (s === 'low') return 'green'
    return 'zinc'
  }
  if (score >= 0.7) return 'red'
  if (score >= 0.4) return 'orange'
  return 'green'
}

export default function CommunityPage() {
  const [stats, setStats] = useState(null)
  const [traces, setTraces] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [statsData, tracesData] = await Promise.all([
          loadJson('/api/community/stats').catch(() => null),
          loadJson('/api/community/traces').catch(() => null),
        ])
        if (cancelled) return
        setStats(statsData)
        setTraces(Array.isArray(tracesData?.traces) ? tracesData.traces : Array.isArray(tracesData) ? tracesData : [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Community</Heading>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
        </div>
      )}

      {loading && <SkeletonRows />}

      {/* Stats Cards */}
      {!loading && stats && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {Object.entries(stats).map(([key, val]) => (
            <div key={key} className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{key}</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
                {typeof val === 'number' ? val : String(val)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Shared Traces Table */}
      {!loading && traces && traces.length > 0 && (
        <>
          <Divider className="my-6" />
          <Subheading>Shared Traces</Subheading>
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Task Label</TableHeader>
                <TableHeader>Objective</TableHeader>
                <TableHeader>Risk Score</TableHeader>
                <TableHeader>Steps</TableHeader>
                <TableHeader>Tags</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {traces.map((trace, idx) => (
                <TableRow key={trace.id || idx}>
                  <TableCell className="font-medium">{trace.taskLabel || trace.name || '--'}</TableCell>
                  <TableCell className="text-zinc-500">{trace.objective || '--'}</TableCell>
                  <TableCell>
                    <Badge color={riskColor(trace.riskScore || trace.risk)}>
                      {trace.riskScore ?? trace.risk ?? '--'}
                    </Badge>
                  </TableCell>
                  <TableCell>{trace.stepCount ?? trace.steps ?? '--'}</TableCell>
                  <TableCell>
                    {Array.isArray(trace.tags) ? (
                      <div className="flex flex-wrap gap-1">
                        {trace.tags.map((tag) => (
                          <Badge key={tag} color="zinc">{tag}</Badge>
                        ))}
                      </div>
                    ) : '--'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {!loading && traces && traces.length === 0 && (
        <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No shared traces yet</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Community-shared traces will appear here.</p>
        </div>
      )}
    </>
  )
}
