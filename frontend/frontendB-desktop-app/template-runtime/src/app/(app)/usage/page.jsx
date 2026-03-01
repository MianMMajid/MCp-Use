'use client'

import { useEffect, useState } from 'react'
import { loadJson, postJson } from '@/lib/api'
import { Heading, Subheading } from '@/components/heading'
import { Badge } from '@/components/badge'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '@/components/table'
import { Button } from '@/components/button'
import { Divider } from '@/components/divider'

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 h-8 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-2 h-3 w-32 rounded bg-zinc-100 dark:bg-zinc-800" />
    </div>
  )
}

export default function UsagePage() {
  const [entitlements, setEntitlements] = useState(null)
  const [usageSummary, setUsageSummary] = useState(null)
  const [timeseries, setTimeseries] = useState(null)
  const [limits, setLimits] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')
  const [overrideInput, setOverrideInput] = useState('')
  const [overriding, setOverriding] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [e, u, ts, l] = await Promise.allSettled([
          loadJson('/api/entitlements'),
          loadJson('/api/usage/summary'),
          loadJson('/api/usage/timeseries'),
          loadJson('/api/limits'),
        ])

        if (cancelled) return

        if (e.status === 'fulfilled') setEntitlements(e.value)
        if (u.status === 'fulfilled') setUsageSummary(u.value)
        if (ts.status === 'fulfilled') {
          const data = ts.value
          setTimeseries(
            Array.isArray(data) ? data : data.data ?? data.series ?? data.items ?? [],
          )
        }
        if (l.status === 'fulfilled') {
          const data = l.value
          setLimits(
            Array.isArray(data) ? data : data.limits ?? data.items ?? [],
          )
        }

        if ([e, u, ts, l].every((r) => r.status === 'rejected')) {
          throw new Error('All endpoints failed')
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleRequestOverride() {
    setOverriding(true)
    setMessage('')
    try {
      const body = overrideInput.trim() ? JSON.parse(overrideInput) : {}
      const res = await postJson('/api/limits/override', body)
      const data = await res.json()
      if (res.ok) {
        setMessage(
          data.message ?? 'Override request submitted.',
        )
        setMessageType('success')
        setOverrideInput('')
      } else {
        setMessage(data.message ?? 'Override request failed.')
        setMessageType('error')
      }
    } catch {
      setMessage('Failed to request override.')
      setMessageType('error')
    } finally {
      setOverriding(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <Heading>Usage & Limits</Heading>
        <Divider className="my-10 mt-6" />
        <div className="grid gap-4 sm:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Heading>Usage & Limits</Heading>

      {message && (
        <p
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            messageType === 'success'
              ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
          }`}
        >
          {message}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Failed to load usage data
          </p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            {error}
          </p>
        </div>
      )}

      <Divider className="my-10 mt-6" />

      {/* ---- Entitlements ---- */}
      {entitlements && (
        <>
          <Subheading>Entitlements</Subheading>
          <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold text-zinc-950 dark:text-zinc-100">
                {entitlements.plan ?? entitlements.name ?? 'Current Plan'}
              </p>
              {entitlements.status && (
                <Badge
                  color={entitlements.status === 'active' ? 'green' : 'zinc'}
                >
                  {entitlements.status}
                </Badge>
              )}
            </div>
            {(entitlements.features ?? entitlements.entitlements) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  entitlements.features ??
                  entitlements.entitlements ??
                  []
                ).map((feature, idx) => {
                  const name =
                    typeof feature === 'string'
                      ? feature
                      : feature.name ?? feature.id
                  const enabled =
                    typeof feature === 'string'
                      ? true
                      : feature.enabled !== false
                  return (
                    <Badge
                      key={idx}
                      color={enabled ? 'green' : 'zinc'}
                    >
                      {name}
                    </Badge>
                  )
                })}
              </div>
            )}
          </div>
          <Divider className="my-10" soft />
        </>
      )}

      {/* ---- Usage Summary ---- */}
      <Subheading>Usage Summary</Subheading>
      {usageSummary ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {(usageSummary.apiCalls != null || usageSummary.calls != null) && (
            <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                API Calls
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
                {(
                  usageSummary.apiCalls ?? usageSummary.calls
                ).toLocaleString()}
              </p>
            </div>
          )}
          {(usageSummary.tokens != null ||
            usageSummary.totalTokens != null) && (
            <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Tokens
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
                {(
                  usageSummary.tokens ?? usageSummary.totalTokens
                ).toLocaleString()}
              </p>
            </div>
          )}
          {(usageSummary.storage != null ||
            usageSummary.storageBytes != null) && (
            <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Storage
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
                {typeof usageSummary.storage === 'string'
                  ? usageSummary.storage
                  : usageSummary.storageBytes != null
                    ? `${(usageSummary.storageBytes / 1048576).toFixed(1)} MB`
                    : usageSummary.storage?.toLocaleString()}
              </p>
            </div>
          )}
          {/* Fallback for unknown shape */}
          {!usageSummary.apiCalls &&
            !usageSummary.calls &&
            !usageSummary.tokens &&
            !usageSummary.totalTokens &&
            !usageSummary.storage &&
            !usageSummary.storageBytes &&
            Object.entries(usageSummary).map(([key, val]) => (
              <div
                key={key}
                className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900"
              >
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {key}
                </p>
                <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
                  {typeof val === 'number' ? val.toLocaleString() : String(val)}
                </p>
              </div>
            ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Usage summary not available.
          </p>
        </div>
      )}

      <Divider className="my-10" soft />

      {/* ---- Usage Timeseries ---- */}
      <Subheading>Daily Usage</Subheading>
      {timeseries && timeseries.length > 0 ? (
        <div className="mt-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Date</TableHeader>
                <TableHeader>API Calls</TableHeader>
                <TableHeader>Tokens</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {timeseries.map((entry, idx) => (
                <TableRow key={entry.date ?? idx}>
                  <TableCell>
                    {entry.date
                      ? new Date(entry.date).toLocaleDateString()
                      : `Day ${idx + 1}`}
                  </TableCell>
                  <TableCell>
                    {(
                      entry.apiCalls ??
                      entry.calls ??
                      entry.requests ??
                      '-'
                    ).toLocaleString?.() ??
                      entry.apiCalls ??
                      entry.calls ??
                      '-'}
                  </TableCell>
                  <TableCell>
                    {(entry.tokens ?? entry.totalTokens ?? '-').toLocaleString?.() ??
                      entry.tokens ??
                      '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No timeseries data available.
          </p>
        </div>
      )}

      <Divider className="my-10" soft />

      {/* ---- Limits ---- */}
      <Subheading>Rate Limits</Subheading>
      {limits && limits.length > 0 ? (
        <div className="mt-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Limit</TableHeader>
                <TableHeader>Current</TableHeader>
                <TableHeader>Max</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {limits.map((limit, idx) => (
                <TableRow key={limit.name ?? limit.id ?? idx}>
                  <TableCell className="font-medium">
                    {limit.name ?? limit.id ?? `Limit ${idx + 1}`}
                  </TableCell>
                  <TableCell>
                    {limit.current?.toLocaleString() ?? limit.value?.toLocaleString() ?? '-'}
                  </TableCell>
                  <TableCell>
                    {limit.max?.toLocaleString() ?? limit.limit?.toLocaleString() ?? '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Override request */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-zinc-950 dark:text-white">
              Request Limit Override (JSON)
            </label>
            <textarea
              className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
              rows={2}
              value={overrideInput}
              onChange={(e) => setOverrideInput(e.target.value)}
              placeholder='{"limit": "requests_per_minute", "requested": 1000}'
            />
            <Button
              className="mt-2"
              onClick={handleRequestOverride}
              disabled={overriding}
            >
              {overriding ? 'Requesting...' : 'Request Override'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No rate limit data available.
          </p>
        </div>
      )}
    </div>
  )
}
