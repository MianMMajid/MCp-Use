'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadJson, postJson } from '@/lib/api'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'
import { SkeletonCard, SkeletonList } from '@/components/Skeleton'
import { ConfirmDialog } from '@/components/ConfirmDialog'

export const sections = [
  { title: 'Active rules', id: 'active-rules' },
  { title: 'Version history', id: 'version-history' },
  { title: 'Actions', id: 'actions' },
  { title: 'Policy operations', id: 'policy-ops' },
]

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

  // Policy operations state
  const [opInput, setOpInput] = useState('')
  const [opResult, setOpResult] = useState(null)
  const [opLoading, setOpLoading] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, v] = await Promise.all([
        loadJson('/admin/api/policies'),
        loadJson('/admin/api/policies/versions'),
      ])
      setPolicies(Array.isArray(p) ? p : p.rules ?? p.policies ?? [])
      setVersions(Array.isArray(v) ? v : v.items ?? v.versions ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* -- Escape key closes inline confirm dialog -- */
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setConfirmAction(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  /* -- Auto-dismiss actionMsg after 5s -- */
  useEffect(() => {
    if (!actionMsg) return
    const t = setTimeout(() => setActionMsg(null), 5000)
    return () => clearTimeout(t)
  }, [actionMsg])

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

  /* -- Policy operation handlers -- */
  async function runPolicyOp(op) {
    setOpLoading(op)
    setOpResult(null)
    try {
      const body = opInput.trim() ? JSON.parse(opInput) : {}
      const result = await postJson(
        `/api/openclaw/modifier/ops/policy/${op}`,
        body,
      )
      setOpResult({ op, data: result })
    } catch (err) {
      setOpResult({ op, error: err.message })
    } finally {
      setOpLoading(null)
      setConfirmAction(null)
    }
  }

  function handleDangerousOp(op) {
    setConfirmAction(op)
  }

  async function handleDiffBeforeApply() {
    setOpLoading('diff-before-apply')
    setOpResult(null)
    try {
      const body = opInput.trim() ? JSON.parse(opInput) : {}
      const result = await postJson(
        '/api/openclaw/modifier/ops/policy/diff-before-apply',
        body,
      )
      setOpResult({ op: 'diff-before-apply', data: result })
    } catch (err) {
      setOpResult({ op: 'diff-before-apply', error: err.message })
    } finally {
      setOpLoading(null)
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
                    key={v.versionId ?? v.id ?? idx}
                    className="flex items-center justify-between rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900"
                  >
                    <div>
                      <span className="text-sm font-medium text-zinc-950 dark:text-white">
                        {v.label ?? v.versionId ?? v.id ?? `v${idx + 1}`}
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
                        onClick={() => handleActivate(v.versionId ?? v.id)}
                        disabled={activating === (v.versionId ?? v.id)}
                      >
                        {activating === (v.versionId ?? v.id) ? 'Activating...' : 'Activate'}
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

          {/* ---- Policy Operations ---- */}
          <section id="policy-ops" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Policy Operations
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Simulate, diff, dry-run, apply, or rollback policy changes.
            </p>

            {/* JSON input */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                Policy Input (JSON)
              </label>
              <textarea
                className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                rows={5}
                value={opInput}
                onChange={(e) => setOpInput(e.target.value)}
                placeholder='{"rules": [...], "version": "v2"}'
              />
            </div>

            {/* Safe operations */}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => runPolicyOp('simulate')}
                disabled={opLoading != null}
              >
                {opLoading === 'simulate' ? 'Simulating...' : 'Simulate'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => runPolicyOp('diff')}
                disabled={opLoading != null}
              >
                {opLoading === 'diff' ? 'Diffing...' : 'Diff Versions'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => runPolicyOp('dry-run')}
                disabled={opLoading != null}
              >
                {opLoading === 'dry-run' ? 'Running...' : 'Dry Run'}
              </Button>
              <Button
                variant="secondary"
                onClick={handleDiffBeforeApply}
                disabled={opLoading != null}
              >
                {opLoading === 'diff-before-apply'
                  ? 'Loading...'
                  : 'Preview Apply Diff'}
              </Button>
            </div>

            {/* Dangerous operations */}
            <div className="mt-3 flex flex-wrap gap-3">
              <Button
                variant="filled"
                onClick={() => handleDangerousOp('apply')}
                disabled={opLoading != null}
              >
                {opLoading === 'apply' ? 'Applying...' : 'Apply'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleDangerousOp('rollback')}
                disabled={opLoading != null}
              >
                {opLoading === 'rollback' ? 'Rolling back...' : 'Rollback'}
              </Button>
            </div>

            {/* Confirmation dialog */}
            {confirmAction && (
              <ConfirmDialog
                title={`Confirm ${confirmAction}`}
                message={`Are you sure you want to ${confirmAction} this policy? This action may affect production.`}
                onConfirm={() => runPolicyOp(confirmAction)}
                onCancel={() => setConfirmAction(null)}
              />
            )}

            {/* Result display */}
            {opResult && (
              <div className="mt-4 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-950 dark:text-white">
                    Result: {opResult.op}
                  </span>
                  {opResult.error ? (
                    <Tag color="rose" variant="small">
                      ERROR
                    </Tag>
                  ) : (
                    <Tag color="orange" variant="small">
                      OK
                    </Tag>
                  )}
                </div>
                {opResult.error ? (
                  <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                    {opResult.error}
                  </p>
                ) : (
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-700 dark:text-zinc-300">
                    {JSON.stringify(opResult.data, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
