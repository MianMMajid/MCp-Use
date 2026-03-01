'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Active rules', id: 'active-rules' },
  { title: 'Version history', id: 'version-history' },
  { title: 'Actions', id: 'actions' },
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

async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

export default function PolicyCenterPage() {
  const [policies, setPolicies] = useState(null)
  const [versions, setVersions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionMsg, setActionMsg] = useState(null)
  const [activating, setActivating] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, v] = await Promise.all([
        loadJson('/admin/api/policies'),
        loadJson('/admin/api/policies/versions'),
      ])
      setPolicies(Array.isArray(p) ? p : p.rules ?? p.policies ?? [])
      setVersions(Array.isArray(v) ? v : v.versions ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleReload() {
    setActionMsg(null)
    try {
      await postJson('/admin/api/policies/reload', {})
      setActionMsg('Policies reloaded successfully.')
      fetchData()
    } catch (err) {
      setActionMsg(`Reload failed: ${err.message}`)
    }
  }

  async function handleValidate() {
    setActionMsg(null)
    try {
      const result = await postJson('/admin/api/policies/validate', {})
      setActionMsg(
        result.valid
          ? 'All policies are valid.'
          : `Validation issues: ${result.errors?.join(', ') ?? 'unknown'}`,
      )
    } catch (err) {
      setActionMsg(`Validation failed: ${err.message}`)
    }
  }

  async function handleActivate(versionId) {
    setActivating(versionId)
    try {
      await postJson(`/admin/api/policies/versions/${versionId}/activate`, {})
      setActionMsg(`Version ${versionId} activated.`)
      fetchData()
    } catch (err) {
      setActionMsg(`Activation failed: ${err.message}`)
    } finally {
      setActivating(null)
    }
  }

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Policy Center
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Review, validate, and manage policy rules, versions, and
            deployments.
          </p>

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

          {/* ---- Actions bar ---- */}
          <section id="actions" className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Actions
            </h2>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button variant="primary" onClick={handleReload}>
                Reload policies
              </Button>
              <Button variant="secondary" onClick={handleValidate}>
                Validate
              </Button>
            </div>
            {actionMsg && (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                {actionMsg}
              </p>
            )}
          </section>

          {/* ---- Active rules ---- */}
          <section id="active-rules" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Active rules
            </h2>

            {loading ? (
              <div className="mt-4">
                <SkeletonList />
              </div>
            ) : policies && policies.length > 0 ? (
              <div className="mt-4 space-y-3">
                {policies.map((rule, idx) => (
                  <div
                    key={rule.id ?? idx}
                    className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-950 dark:text-white">
                          {rule.name ?? rule.id ?? `Rule ${idx + 1}`}
                        </span>
                        {rule.action && (
                          <Tag
                            color={
                              rule.action === 'allow'
                                ? 'orange'
                                : rule.action === 'block'
                                  ? 'rose'
                                  : 'amber'
                            }
                          >
                            {rule.action.toUpperCase()}
                          </Tag>
                        )}
                      </div>
                      {rule.priority != null && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          priority {rule.priority}
                        </span>
                      )}
                    </div>
                    {rule.description && (
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {rule.description}
                      </p>
                    )}
                    {rule.conditions && (
                      <p className="mt-1 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                        {typeof rule.conditions === 'string'
                          ? rule.conditions
                          : JSON.stringify(rule.conditions)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No policy rules found.
                </p>
              </div>
            )}
          </section>

          {/* ---- Version history ---- */}
          <section id="version-history" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Version history
            </h2>

            {loading ? (
              <div className="mt-4">
                <SkeletonList />
              </div>
            ) : versions && versions.length > 0 ? (
              <div className="mt-4 space-y-3">
                {versions.map((v, idx) => (
                  <div
                    key={v.id ?? idx}
                    className="flex items-center justify-between rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900"
                  >
                    <div>
                      <span className="text-sm font-medium text-zinc-950 dark:text-white">
                        {v.label ?? v.id ?? `v${idx + 1}`}
                      </span>
                      {v.active && (
                        <Tag color="orange" variant="medium">
                          ACTIVE
                        </Tag>
                      )}
                      {v.createdAt && (
                        <span className="ml-3 text-xs text-zinc-500 dark:text-zinc-400">
                          {new Date(v.createdAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                    {!v.active && (
                      <Button
                        variant="secondary"
                        onClick={() => handleActivate(v.id)}
                        disabled={activating === v.id}
                      >
                        {activating === v.id ? 'Activating...' : 'Activate'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No policy versions found.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
