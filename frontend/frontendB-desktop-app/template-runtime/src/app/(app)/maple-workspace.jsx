'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'

function useCapabilityRows(capabilities) {
  return useMemo(() => {
    if (!capabilities || typeof capabilities !== 'object') {
      return []
    }
    return Object.entries(capabilities)
      .filter(([, value]) => value && typeof value === 'object')
      .map(([name, value]) => ({
        name,
        enabled: Boolean(value.enabled),
        reason: value.reason || 'No details provided',
      }))
      .slice(0, 8)
  }, [capabilities])
}

async function loadJson(path) {
  const response = await fetch(path, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`${path} -> ${response.status}`)
  }
  return response.json()
}

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
          <div key={i} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
            <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="mt-2 h-3 w-56 rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function MapleWorkspace() {
  const [capabilities, setCapabilities] = useState(null)
  const [status, setStatus] = useState(null)
  const [hitl, setHitl] = useState([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const capabilityRows = useCapabilityRows(capabilities)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [capabilityData, statusData, hitlData] = await Promise.all([
          loadJson('/api/runtime/feature-capabilities').catch(() => null),
          loadJson('/api/firewall/state').catch(() => null),
          loadJson('/api/hitl/approvals').catch(() => ({ approvals: [] })),
        ])
        if (cancelled) return
        setCapabilities(capabilityData)
        setStatus(statusData)
        setHitl(Array.isArray(hitlData?.approvals) ? hitlData.approvals.slice(0, 6) : [])
      } catch (runtimeError) {
        if (!cancelled) {
          setError(runtimeError instanceof Error ? runtimeError.message : String(runtimeError))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  if (isLoading) {
    return (
      <>
        <Heading>Agent Orchestration Workspace</Heading>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Loading workspace data...
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <SkeletonList />
          <SkeletonList />
        </div>
      </>
    )
  }

  return (
    <>
      <Heading>Agent Orchestration Workspace</Heading>
      <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
        Desktop Studio controls agent runs, HITL approvals, and runtime readiness through Maple gateway APIs.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Some workspace data could not be loaded
          </p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            The gateway may be starting up or temporarily unavailable. Data shown below may be incomplete. Try refreshing the page.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <Subheading>Gateway Status</Subheading>
          <div className="mt-3 flex items-center gap-2">
            <Badge color={status?.ok ? 'green' : 'orange'}>
              {status?.ok ? 'ok' : 'unknown'}
            </Badge>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">/api/firewall/state</span>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <Subheading>Capabilities</Subheading>
          <p className="mt-3 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">{capabilityRows.length}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">features reported</p>
        </div>

        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <Subheading>Pending HITL</Subheading>
          <p className="mt-3 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">{hitl.length}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">approval requests queued</p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <Subheading>Feature Capabilities</Subheading>
          <div className="mt-4 space-y-3">
            {capabilityRows.length === 0 && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Capability payload not available yet.</p>
            )}
            {capabilityRows.map((row) => (
              <div key={row.name} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{row.name}</p>
                  <Badge color={row.enabled ? 'green' : 'orange'}>{row.enabled ? 'enabled' : 'disabled'}</Badge>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{row.reason}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <Subheading>Approval Queue</Subheading>
          <div className="mt-4 space-y-3">
            {hitl.length === 0 && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No pending approvals.</p>
            )}
            {hitl.map((item, index) => (
              <div key={item.id || item.requestId || index} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.toolName || item.action || 'Pending request'}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{item.traceId || item.requestId || 'No trace id available'}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button color="orange" href="/events">Open agent catalog</Button>
        <Button color="orange" href="/orders">Review approvals</Button>
        <Button outline href="/settings">Manage account</Button>
      </div>
    </>
  )
}
