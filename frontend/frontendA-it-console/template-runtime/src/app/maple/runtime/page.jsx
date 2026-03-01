'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Health', id: 'health' },
  { title: 'Feature capabilities', id: 'feature-capabilities' },
]

/* ------------------------------------------------------------------ */
/*  Fetch helpers                                                      */
/* ------------------------------------------------------------------ */

async function loadJson(path) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [h, c] = await Promise.allSettled([
        loadJson('/health'),
        loadJson('/api/runtime/feature-capabilities'),
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

      if (h.status === 'rejected' && c.status === 'rejected') {
        throw new Error('All endpoints failed')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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
        </div>
      </div>
    </article>
  )
}
