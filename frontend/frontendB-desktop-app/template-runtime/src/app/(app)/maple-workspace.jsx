'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { Link } from '@/components/link'
import { QuickActions } from '@/components/quick-actions'
import { RiskBadge } from '@/components/risk-badge'
import { StatCard } from '@/components/stat-card'
import { loadJson, getCached } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'
import { SkeletonCard, SkeletonList } from '@/components/skeleton'

export default function MaypleWorkspace() {
  const _cCaps = getCached('/api/runtime/feature-capabilities')
  const _cFw = getCached('/api/firewall/state')
  const _cHitl = getCached('/api/hitl/approvals')
  const hasCached = !!(_cCaps || _cFw || _cHitl)

  const [caps, setCaps] = useState(_cCaps || null)
  const [fwState, setFwState] = useState(_cFw || null)
  const [hitl, setHitl] = useState(_cHitl || null)
  const [agents, setAgents] = useState(null)
  const [runs, setRuns] = useState(null)
  const [notifications, setNotifications] = useState(null)
  const [loading, setLoading] = useState(!hasCached)
  const [error, setError] = useState('')

  const capabilityRows = useMemo(() => {
    if (!caps || typeof caps !== 'object') return []
    const capabilities = caps.capabilities ?? caps
    if (typeof capabilities !== 'object') return []
    return Object.entries(capabilities)
      .filter(([, value]) => value && typeof value === 'object')
      .map(([name, value]) => ({
        name,
        enabled: Boolean(value.enabled),
        reason: value.reason || 'No details provided',
      }))
      .slice(0, 8)
  }, [caps])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [capsData, fwData, hitlData, agentsData, runsData, notifsData] = await Promise.all([
          loadJson('/api/runtime/feature-capabilities').catch(() => null),
          loadJson('/api/firewall/state').catch(() => null),
          loadJson('/api/hitl/approvals').catch(() => ({ approvals: [] })),
          loadJson('/api/agents?pinned=true').catch(() => null),
          loadJson('/api/runs').catch(() => null),
          loadJson('/api/notifications').catch(() => null),
        ])
        if (cancelled) return
        setCaps(capsData)
        setFwState(fwData)
        setHitl(hitlData)
        setAgents(agentsData)
        setRuns(runsData)
        setNotifications(notifsData)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const approvalCount = hitl?.count ?? (Array.isArray(hitl?.approvals) ? hitl.approvals.length : 0)
  const approvalList = Array.isArray(hitl?.approvals) ? hitl.approvals.slice(0, 6) : []
  const gatewayOk = fwState?.ok === true
  const agentList = Array.isArray(agents?.items) ? agents.items : []
  const runList = Array.isArray(runs?.items) ? runs.items : []
  const alertList = Array.isArray(notifications?.items) ? notifications.items.slice(0, 5) : []

  if (loading) {
    return (
      <>
        <Heading>Agent Orchestration Console</Heading>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Loading workspace data...</p>
        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <SkeletonList /><SkeletonList />
        </div>
      </>
    )
  }

  return (
    <>
      <Heading>Agent Orchestration Console</Heading>
      <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
        Manage agents, monitor runs, and review approvals from a single dashboard.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            The gateway may be starting up. Try refreshing the page.
          </p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mt-8">
        <Subheading>Quick Actions</Subheading>
        <div className="mt-4">
          <QuickActions />
        </div>
      </div>

      {/* Stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Gateway Status"
          value={gatewayOk ? 'Online' : 'Unknown'}
          badge={gatewayOk ? 'ok' : 'unknown'}
          badgeColor={gatewayOk ? 'green' : 'zinc'}
        />
        <StatCard
          title="Capabilities"
          value={capabilityRows.length}
          subtitle="features reported"
        />
        <StatCard
          title="Pending HITL"
          value={approvalCount}
          subtitle="approval requests queued"
          badge={approvalCount > 0 ? 'action needed' : undefined}
          badgeColor="orange"
        />
        <StatCard
          title="Active Runs"
          value={runList.filter((r) => r.status === 'running').length}
          subtitle={`${runList.length} total`}
        />
      </div>

      {/* My Agents (pinned) */}
      {agentList.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center justify-between">
            <Subheading>My Agents</Subheading>
            <Button href="/agents" outline className="text-xs">View all</Button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agentList.slice(0, 6).map((agent) => (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="rounded-xl border border-zinc-200 bg-white p-4 transition hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{agent.name}</p>
                  <RiskBadge tier={agent.riskTier} />
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {agent.description || 'No description'}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Badge color={statusColor(agent.status)}>{agent.status}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent Runs */}
      {runList.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center justify-between">
            <Subheading>Recent Runs</Subheading>
            <Button href="/?mode=orchestration&panel=timeline" outline className="text-xs">Open in Chat</Button>
          </div>
          <div className="mt-4 space-y-2">
            {runList.slice(0, 5).map((run) => (
              <Link
                key={run.runId}
                href={`/?mode=orchestration&executionId=${encodeURIComponent(run.runId)}&panel=timeline`}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-zinc-500">{run.runId.slice(0, 8)}</span>
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{run.type}</span>
                </div>
                <div className="flex items-center gap-2">
                  {run.cost && (
                    <span className="text-xs text-zinc-500">${run.cost.estimatedCostUsd.toFixed(4)}</span>
                  )}
                  <Badge color={statusColor(run.status)}>{run.status}</Badge>
                  <span className="text-xs text-zinc-400">{formatDate(run.updatedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Alerts */}
      {alertList.length > 0 && (
        <div className="mt-10">
          <Subheading>Alerts</Subheading>
          <div className="mt-4 space-y-2">
            {alertList.map((notif) => (
              <div
                key={notif.id}
                className={`rounded-lg border px-4 py-3 ${notif.read ? 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900' : 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30'}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{notif.title}</p>
                  <Badge color={notif.read ? 'zinc' : 'orange'}>{notif.type}</Badge>
                </div>
                {notif.body && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{notif.body}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feature Capabilities + Approval Queue */}
      <div className="mt-10 grid gap-6 xl:grid-cols-2">
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
            {approvalList.length === 0 && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No pending approvals.</p>
            )}
            {approvalList.map((item, index) => (
              <div key={item.id || item.requestId || index} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.toolName || item.action || 'Pending request'}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{item.traceId || item.requestId || 'No trace id available'}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button color="orange" href="/agents">Open agent catalog</Button>
        <Button color="orange" href="/orchestrate">Open orchestrations</Button>
        <Button outline href="/settings">Manage account</Button>
      </div>
    </>
  )
}
