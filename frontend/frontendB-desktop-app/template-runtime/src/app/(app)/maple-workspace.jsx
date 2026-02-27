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

export function MapleWorkspace() {
  const [capabilities, setCapabilities] = useState(null)
  const [status, setStatus] = useState(null)
  const [hitl, setHitl] = useState([])
  const [error, setError] = useState('')
  const capabilityRows = useCapabilityRows(capabilities)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [capabilityData, statusData, hitlData] = await Promise.all([
          loadJson('/api/runtime/feature-capabilities').catch(() => null),
          loadJson('/api/firewall/status').catch(() => null),
          loadJson('/api/hitl/list').catch(() => ({ items: [] })),
        ])
        if (cancelled) return
        setCapabilities(capabilityData)
        setStatus(statusData)
        setHitl(Array.isArray(hitlData?.items) ? hitlData.items.slice(0, 6) : [])
      } catch (runtimeError) {
        if (!cancelled) {
          setError(runtimeError instanceof Error ? runtimeError.message : String(runtimeError))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <Heading>Agent Orchestration Workspace</Heading>
      <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
        Desktop Studio controls agent runs, HITL approvals, and runtime readiness through Maple gateway APIs.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <Subheading>Gateway Status</Subheading>
          <div className="mt-3 flex items-center gap-2">
            <Badge color={status?.status === 'ok' ? 'green' : 'orange'}>
              {status?.status || 'unknown'}
            </Badge>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">/api/firewall/status</span>
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

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          Failed to load workspace data: {error}
        </p>
      )}
    </>
  )
}
