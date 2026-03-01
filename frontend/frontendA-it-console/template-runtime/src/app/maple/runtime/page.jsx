'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadJson, postJson } from '@/lib/api'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Health', id: 'health' },
  { title: 'Feature capabilities', id: 'feature-capabilities' },
  { title: 'Runtime status', id: 'runtime-status' },
  { title: 'Diagnostics', id: 'diagnostics' },
  { title: 'Logs', id: 'logs' },
  { title: 'Dependencies', id: 'dependencies' },
  { title: 'Rate limits', id: 'rate-limits' },
  { title: 'User profile', id: 'user-profile' },
]

/* ------------------------------------------------------------------ */
/*  Skeletons                                                          */
/* ------------------------------------------------------------------ */

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
          <div
            key={i}
            className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700"
          >
            <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="mt-2 h-3 w-56 rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function RuntimeDependenciesPage() {
  const [health, setHealth] = useState(null)
  const [capabilities, setCapabilities] = useState(null)
  const [runtimeStatus, setRuntimeStatus] = useState(null)
  const [logs, setLogs] = useState(null)
  const [diag, setDiag] = useState(null)
  const [deps, setDeps] = useState(null)
  const [rateLimits, setRateLimits] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [quotaMsg, setQuotaMsg] = useState(null)
  const [quotaInput, setQuotaInput] = useState('')
  const [showQuotaForm, setShowQuotaForm] = useState(false)

  // User profile
  const [profile, setProfile] = useState(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [h, c, rs, lg, dg, dp, rl, up] = await Promise.allSettled([
        loadJson('/health'),
        loadJson('/api/runtime/feature-capabilities'),
        loadJson('/api/runtime/status'),
        loadJson('/api/runtime/logs'),
        loadJson('/api/runtime/diag'),
        loadJson('/api/runtime/dependencies'),
        loadJson('/api/openclaw/modifier/ops/rate-limit'),
        loadJson('/api/user/profile'),
      ])

      if (h.status === 'fulfilled') setHealth(h.value)
      if (c.status === 'fulfilled') {
        const data = c.value
        setCapabilities(
          Array.isArray(data)
            ? data
            : data.capabilities ?? data.features ?? [],
        )
      }
      if (rs.status === 'fulfilled') setRuntimeStatus(rs.value)
      if (lg.status === 'fulfilled') {
        const data = lg.value
        setLogs(Array.isArray(data) ? data : data.logs ?? data.entries ?? [])
      }
      if (dg.status === 'fulfilled') setDiag(dg.value)
      if (dp.status === 'fulfilled') {
        const data = dp.value
        setDeps(Array.isArray(data) ? data : data.dependencies ?? data.tree ?? [])
      }
      if (rl.status === 'fulfilled') setRateLimits(rl.value)
      if (up.status === 'fulfilled') setProfile(up.value)

      const allFailed = [h, c, rs, lg, dg, dp, rl, up].every(
        (r) => r.status === 'rejected',
      )
      if (allFailed) throw new Error('All endpoints failed')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) return
    setChangingPassword(true)
    setPasswordMsg('')
    try {
      const result = await postJson('/api/user/change-password', { currentPassword, newPassword })
      setPasswordMsg(result.message || 'Password changed successfully.')
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      setPasswordMsg(`Failed: ${err.message}`)
    } finally {
      setChangingPassword(false)
    }
  }

  async function handleConfigureQuotas() {
    setQuotaMsg(null)
    try {
      const body = quotaInput.trim() ? JSON.parse(quotaInput) : {}
      const result = await postJson(
        '/api/openclaw/modifier/ops/rate-limit/config',
        body,
      )
      setQuotaMsg(
        result.message ?? result.status ?? 'Quota configuration updated.',
      )
      setShowQuotaForm(false)
      setQuotaInput('')
      fetchData()
    } catch (err) {
      setQuotaMsg(`Failed: ${err.message}`)
    }
  }

  /* -- Derive health status -- */
  const healthStatus = health
    ? health.status ?? (health.ok ? 'healthy' : 'degraded')
    : null
  const healthColor =
    healthStatus === 'healthy' || healthStatus === 'ok'
      ? 'orange'
      : healthStatus === 'degraded'
        ? 'amber'
        : 'rose'
  const uptimeStr = health?.uptime
    ? `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m`
    : null

  const enabledCount = capabilities
    ? capabilities.filter((c) => c.enabled !== false).length
    : 0
  const totalCount = capabilities ? capabilities.length : 0

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
                Runtime Dependencies
              </h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Verify production dependency readiness and feature capabilities.
              </p>
            </div>
            <Button variant="secondary" onClick={fetchData} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Some data could not be loaded
              </p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                The gateway may be starting up or temporarily unavailable. Try
                refreshing the page.
              </p>
            </div>
          )}

          {/* ---- Health card ---- */}
          <section id="health" className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Health
            </h2>

            {loading && !health ? (
              <div className="mt-4">
                <SkeletonCard />
              </div>
            ) : health ? (
              <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-block h-3 w-3 rounded-full ${
                      healthColor === 'orange'
                        ? 'bg-orange-500'
                        : healthColor === 'amber'
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                    }`}
                  />
                  <span className="text-lg font-semibold text-zinc-950 dark:text-white">
                    {healthStatus
                      ? healthStatus.charAt(0).toUpperCase() +
                        healthStatus.slice(1)
                      : 'Unknown'}
                  </span>
                  <Tag color={healthColor} variant="medium">
                    {healthStatus?.toUpperCase() ?? 'UNKNOWN'}
                  </Tag>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {uptimeStr && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Uptime
                      </span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">
                        {uptimeStr}
                      </p>
                    </div>
                  )}
                  {health.version && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Version
                      </span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">
                        {health.version}
                      </p>
                    </div>
                  )}
                  {health.environment && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Environment
                      </span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">
                        {health.environment}
                      </p>
                    </div>
                  )}
                </div>

                {/* Service dependencies from health */}
                {health.services && (
                  <div className="mt-4">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Service dependencies
                    </span>
                    <div className="mt-2 space-y-2">
                      {Object.entries(health.services).map(
                        ([name, svc]) => (
                          <div
                            key={name}
                            className="flex items-center justify-between rounded-xl border border-zinc-950/5 px-3 py-2 dark:border-white/5"
                          >
                            <span className="text-sm text-zinc-950 dark:text-white">
                              {name}
                            </span>
                            <Tag
                              color={
                                (typeof svc === 'string' ? svc : svc?.status) ===
                                  'ok' ||
                                (typeof svc === 'string' ? svc : svc?.status) ===
                                  'healthy'
                                  ? 'orange'
                                  : 'rose'
                              }
                              variant="medium"
                            >
                              {(typeof svc === 'string'
                                ? svc
                                : svc?.status ?? 'unknown'
                              ).toUpperCase()}
                            </Tag>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Health endpoint not available.
                </p>
              </div>
            )}
          </section>

          {/* ---- Feature capabilities grid ---- */}
          <section id="feature-capabilities" className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                Feature capabilities
              </h2>
              {capabilities && (
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  {enabledCount} of {totalCount} enabled
                </span>
              )}
            </div>

            {loading && !capabilities ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : capabilities && capabilities.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {capabilities.map((cap, idx) => (
                  <div
                    key={cap.name ?? cap.id ?? idx}
                    className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-950 dark:text-white">
                        {cap.name ?? cap.id ?? `Feature ${idx + 1}`}
                      </span>
                      <Tag
                        color={cap.enabled !== false ? 'orange' : 'rose'}
                        variant="medium"
                      >
                        {cap.enabled !== false ? 'ENABLED' : 'DISABLED'}
                      </Tag>
                    </div>
                    {cap.description && (
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        {cap.description}
                      </p>
                    )}
                    {cap.provider && (
                      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                        Provider: {cap.provider}
                      </p>
                    )}
                    {cap.version && (
                      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                        v{cap.version}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No feature capabilities reported.
                </p>
              </div>
            )}
          </section>

          {/* ---- Runtime Status ---- */}
          <section id="runtime-status" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Runtime Status
            </h2>

            {loading && !runtimeStatus ? (
              <div className="mt-4">
                <SkeletonCard />
              </div>
            ) : runtimeStatus ? (
              <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {runtimeStatus.uptime != null && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Uptime
                      </span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">
                        {typeof runtimeStatus.uptime === 'number'
                          ? `${Math.floor(runtimeStatus.uptime / 3600)}h ${Math.floor((runtimeStatus.uptime % 3600) / 60)}m`
                          : runtimeStatus.uptime}
                      </p>
                    </div>
                  )}
                  {runtimeStatus.version && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Version
                      </span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">
                        {runtimeStatus.version}
                      </p>
                    </div>
                  )}
                  {runtimeStatus.pid != null && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        PID
                      </span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">
                        {runtimeStatus.pid}
                      </p>
                    </div>
                  )}
                  {runtimeStatus.nodeVersion && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Node Version
                      </span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">
                        {runtimeStatus.nodeVersion}
                      </p>
                    </div>
                  )}
                  {runtimeStatus.platform && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Platform
                      </span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">
                        {runtimeStatus.platform}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Runtime status not available.
                </p>
              </div>
            )}
          </section>

          {/* ---- Diagnostics ---- */}
          <section id="diagnostics" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Diagnostics
            </h2>

            {loading && !diag ? (
              <div className="mt-4">
                <SkeletonCard />
              </div>
            ) : diag ? (
              <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {diag.memory && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Memory
                      </span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">
                        {typeof diag.memory === 'object'
                          ? `RSS: ${Math.round((diag.memory.rss ?? 0) / 1048576)}MB / Heap: ${Math.round((diag.memory.heapUsed ?? 0) / 1048576)}MB`
                          : diag.memory}
                      </p>
                    </div>
                  )}
                  {diag.cpu != null && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        CPU
                      </span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">
                        {typeof diag.cpu === 'object'
                          ? JSON.stringify(diag.cpu)
                          : diag.cpu}
                      </p>
                    </div>
                  )}
                  {diag.uptime != null && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Process Uptime
                      </span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">
                        {typeof diag.uptime === 'number'
                          ? `${Math.floor(diag.uptime / 3600)}h ${Math.floor((diag.uptime % 3600) / 60)}m`
                          : diag.uptime}
                      </p>
                    </div>
                  )}
                  {diag.eventLoopLag != null && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Event Loop Lag
                      </span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">
                        {diag.eventLoopLag}ms
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Diagnostics not available.
                </p>
              </div>
            )}
          </section>

          {/* ---- Recent Logs ---- */}
          <section id="logs" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Recent Logs
            </h2>

            {loading && !logs ? (
              <div className="mt-4">
                <SkeletonList />
              </div>
            ) : logs && logs.length > 0 ? (
              <div className="mt-4 max-h-80 overflow-auto rounded-2xl border border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900">
                <div className="divide-y divide-zinc-950/5 dark:divide-white/5">
                  {logs.map((entry, idx) => (
                    <div key={idx} className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {entry.level && (
                          <Tag
                            color={
                              entry.level === 'error'
                                ? 'rose'
                                : entry.level === 'warn'
                                  ? 'amber'
                                  : 'zinc'
                            }
                            variant="small"
                          >
                            {entry.level.toUpperCase()}
                          </Tag>
                        )}
                        {entry.timestamp && (
                          <span className="text-xs text-zinc-400 dark:text-zinc-500">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                        {entry.message ?? entry.msg ?? JSON.stringify(entry)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No recent logs available.
                </p>
              </div>
            )}
          </section>

          {/* ---- Dependency Tree ---- */}
          <section id="dependencies" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Dependency Tree
            </h2>

            {loading && !deps ? (
              <div className="mt-4">
                <SkeletonList />
              </div>
            ) : deps && deps.length > 0 ? (
              <div className="mt-4 overflow-auto rounded-2xl border border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-950/5 dark:border-white/5">
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Name
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Version
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-950/5 dark:divide-white/5">
                    {deps.map((dep, idx) => (
                      <tr key={dep.name ?? idx}>
                        <td className="px-4 py-2 font-medium text-zinc-950 dark:text-white">
                          {dep.name ?? dep.package ?? `Dependency ${idx + 1}`}
                        </td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                          {dep.version ?? '-'}
                        </td>
                        <td className="px-4 py-2">
                          {dep.status && (
                            <Tag
                              color={
                                dep.status === 'ok' || dep.status === 'installed'
                                  ? 'orange'
                                  : 'amber'
                              }
                              variant="small"
                            >
                              {dep.status.toUpperCase()}
                            </Tag>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No dependency information available.
                </p>
              </div>
            )}
          </section>

          {/* ---- Rate Limits & Quotas ---- */}
          <section id="rate-limits" className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                Rate Limits & Quotas
              </h2>
              <Button
                variant="secondary"
                onClick={() => setShowQuotaForm(!showQuotaForm)}
              >
                Configure Quotas
              </Button>
            </div>

            {loading && !rateLimits ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : rateLimits ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {rateLimits.requestsPerMinute != null && (
                  <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Requests / min
                    </span>
                    <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-white">
                      {rateLimits.requestsPerMinute}
                    </p>
                  </div>
                )}
                {rateLimits.tokensPerMinute != null && (
                  <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Tokens / min
                    </span>
                    <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-white">
                      {rateLimits.tokensPerMinute}
                    </p>
                  </div>
                )}
                {rateLimits.concurrentRequests != null && (
                  <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Concurrent Requests
                    </span>
                    <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-white">
                      {rateLimits.concurrentRequests}
                    </p>
                  </div>
                )}
                {/* Fallback: render all keys as cards */}
                {!rateLimits.requestsPerMinute &&
                  !rateLimits.tokensPerMinute &&
                  !rateLimits.concurrentRequests &&
                  Object.entries(rateLimits).map(([key, val]) => (
                    <div
                      key={key}
                      className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900"
                    >
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {key}
                      </span>
                      <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-white">
                        {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                      </p>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Rate limit data not available.
                </p>
              </div>
            )}

            {/* Quota config form */}
            {showQuotaForm && (
              <div className="mt-4 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
                <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                  Quota Configuration (JSON)
                </label>
                <textarea
                  className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                  rows={4}
                  value={quotaInput}
                  onChange={(e) => setQuotaInput(e.target.value)}
                  placeholder='{"requestsPerMinute": 100, "tokensPerMinute": 10000}'
                />
                <div className="mt-3 flex gap-2">
                  <Button variant="filled" onClick={handleConfigureQuotas}>
                    Apply Configuration
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowQuotaForm(false)
                      setQuotaInput('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                {quotaMsg && (
                  <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {quotaMsg}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* ---- User Profile ---- */}
          <section id="user-profile" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              User Profile
            </h2>
            {profile ? (
              <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {profile.user?.username && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Username</span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">{profile.user.username}</p>
                    </div>
                  )}
                  {profile.user?.email && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Email</span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">{profile.user.email}</p>
                    </div>
                  )}
                  {profile.subscription?.plan && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Plan</span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">{profile.subscription.plan}</p>
                    </div>
                  )}
                </div>
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">Change password</h3>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input type="password" className="rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-800 dark:text-white" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" />
                    <input type="password" className="rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-800 dark:text-white" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" />
                  </div>
                  <Button className="mt-2" variant="filled" disabled={!currentPassword || !newPassword || changingPassword} onClick={handleChangePassword}>
                    {changingPassword ? 'Changing...' : 'Change Password'}
                  </Button>
                  {passwordMsg && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{passwordMsg}</p>}
                </div>
              </div>
            ) : !loading ? (
              <p className="mt-4 text-sm text-zinc-500">User profile not available.</p>
            ) : null}
          </section>
        </div>
      </div>
    </article>
  )
}
