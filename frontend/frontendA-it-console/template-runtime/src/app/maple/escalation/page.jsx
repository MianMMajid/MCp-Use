'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Escalation chains', id: 'escalation-chains' },
  { title: 'Break-glass', id: 'break-glass' },
  { title: 'Step-up auth', id: 'step-up-auth' },
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
/*  Confirmation dialog                                                */
/* ------------------------------------------------------------------ */

function ConfirmDialog({ title, message, onConfirm, onCancel }) {
  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
        {title}
      </p>
      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
        {message}
      </p>
      <div className="mt-3 flex gap-2">
        <Button variant="filled" onClick={onConfirm}>
          Confirm
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function EscalationPage() {
  // Escalation chain state
  const [chain, setChain] = useState(null)
  const [chainLoading, setChainLoading] = useState(true)
  const [chainError, setChainError] = useState(null)
  const [showChainForm, setShowChainForm] = useState(false)
  const [chainInput, setChainInput] = useState('')
  const [chainMsg, setChainMsg] = useState(null)
  const [escalating, setEscalating] = useState(false)
  const [escalateInput, setEscalateInput] = useState('')
  const [expandedApprovalId, setExpandedApprovalId] = useState(null)
  const [approvalHistory, setApprovalHistory] = useState(null)

  // Break-glass state
  const [breakGlassEvents, setBreakGlassEvents] = useState(null)
  const [breakGlassLoading, setBreakGlassLoading] = useState(true)
  const [breakGlassError, setBreakGlassError] = useState(null)
  const [showBreakGlassConfirm, setShowBreakGlassConfirm] = useState(false)
  const [breakGlassInput, setBreakGlassInput] = useState('')
  const [breakGlassMsg, setBreakGlassMsg] = useState(null)
  const [reviewingId, setReviewingId] = useState(null)
  const [reviewInput, setReviewInput] = useState('')

  // Step-up auth state
  const [stepUpStatus, setStepUpStatus] = useState(null)
  const [stepUpLoading, setStepUpLoading] = useState(true)
  const [stepUpError, setStepUpError] = useState(null)
  const [challengeInput, setChallengeInput] = useState('')
  const [challengeResult, setChallengeResult] = useState(null)
  const [verifyInput, setVerifyInput] = useState('')
  const [verifyResult, setVerifyResult] = useState(null)

  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setChainLoading(true)
    setBreakGlassLoading(true)
    setStepUpLoading(true)
    setError(null)
    try {
      const [c, bg, su] = await Promise.allSettled([
        loadJson('/api/openclaw/modifier/ops/escalation'),
        loadJson('/api/openclaw/modifier/ops/break-glass'),
        loadJson('/api/openclaw/modifier/ops/step-up/status'),
      ])

      if (c.status === 'fulfilled') setChain(c.value)
      else setChainError(c.reason?.message)

      if (bg.status === 'fulfilled') {
        const data = bg.value
        setBreakGlassEvents(
          Array.isArray(data) ? data : data.events ?? data.items ?? [],
        )
      } else setBreakGlassError(bg.reason?.message)

      if (su.status === 'fulfilled') setStepUpStatus(su.value)
      else setStepUpError(su.reason?.message)

      if ([c, bg, su].every((r) => r.status === 'rejected'))
        throw new Error('All endpoints failed')
    } catch (err) {
      setError(err.message)
    } finally {
      setChainLoading(false)
      setBreakGlassLoading(false)
      setStepUpLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* -- Escalation handlers -- */
  async function handleSaveChain() {
    setChainMsg(null)
    try {
      const body = chainInput.trim() ? JSON.parse(chainInput) : {}
      const result = await postJson(
        '/api/openclaw/modifier/ops/escalation',
        body,
      )
      setChainMsg(result.message ?? 'Chain updated.')
      setShowChainForm(false)
      setChainInput('')
      fetchData()
    } catch (err) {
      setChainMsg(`Failed: ${err.message}`)
    }
  }

  async function handleEscalate() {
    setEscalating(true)
    setChainMsg(null)
    try {
      const body = escalateInput.trim() ? JSON.parse(escalateInput) : {}
      const result = await postJson(
        '/api/openclaw/modifier/ops/escalation/escalate',
        body,
      )
      setChainMsg(result.message ?? 'Escalation triggered.')
      setEscalateInput('')
    } catch (err) {
      setChainMsg(`Escalation failed: ${err.message}`)
    } finally {
      setEscalating(false)
    }
  }

  async function handleViewHistory(approvalId) {
    if (expandedApprovalId === approvalId) {
      setExpandedApprovalId(null)
      setApprovalHistory(null)
      return
    }
    setExpandedApprovalId(approvalId)
    try {
      const data = await loadJson(
        `/api/openclaw/modifier/ops/escalation/${approvalId}/history`,
      )
      setApprovalHistory(
        Array.isArray(data) ? data : data.history ?? data.events ?? [],
      )
    } catch {
      setApprovalHistory(null)
    }
  }

  /* -- Break-glass handlers -- */
  async function handleExecuteBreakGlass() {
    setBreakGlassMsg(null)
    try {
      const body = breakGlassInput.trim() ? JSON.parse(breakGlassInput) : {}
      const result = await postJson(
        '/api/openclaw/modifier/ops/break-glass',
        body,
      )
      setBreakGlassMsg(result.message ?? 'Break-glass executed.')
      setShowBreakGlassConfirm(false)
      setBreakGlassInput('')
      fetchData()
    } catch (err) {
      setBreakGlassMsg(`Failed: ${err.message}`)
    }
  }

  async function handleReviewBreakGlass(id) {
    setBreakGlassMsg(null)
    try {
      const body = reviewInput.trim() ? JSON.parse(reviewInput) : {}
      const result = await postJson(
        `/api/openclaw/modifier/ops/break-glass/${id}/review`,
        body,
      )
      setBreakGlassMsg(result.message ?? 'Review submitted.')
      setReviewingId(null)
      setReviewInput('')
      fetchData()
    } catch (err) {
      setBreakGlassMsg(`Review failed: ${err.message}`)
    }
  }

  /* -- Step-up auth handlers -- */
  async function handleCreateChallenge() {
    setChallengeResult(null)
    try {
      const body = challengeInput.trim() ? JSON.parse(challengeInput) : {}
      const result = await postJson(
        '/api/openclaw/modifier/ops/step-up/challenge',
        body,
      )
      setChallengeResult(result)
    } catch (err) {
      setChallengeResult({ error: err.message })
    }
  }

  async function handleVerifyChallenge() {
    setVerifyResult(null)
    try {
      const body = verifyInput.trim() ? JSON.parse(verifyInput) : {}
      const result = await postJson(
        '/api/openclaw/modifier/ops/step-up/verify',
        body,
      )
      setVerifyResult(result)
      fetchData()
    } catch (err) {
      setVerifyResult({ error: err.message })
    }
  }

  const globalError = error || chainError || breakGlassError || stepUpError

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Escalation & Emergency
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Manage escalation chains, break-glass access, and step-up
            authentication.
          </p>

          {/* Error banner */}
          {globalError && (
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

          {/* ---- Escalation Chains ---- */}
          <section id="escalation-chains" className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                Escalation Chains
              </h2>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setShowChainForm(!showChainForm)}
                >
                  Edit Chain
                </Button>
              </div>
            </div>

            {chainLoading && !chain ? (
              <div className="mt-4">
                <SkeletonCard />
              </div>
            ) : chain ? (
              <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                <pre className="max-h-48 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
                  {JSON.stringify(chain, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No escalation chain configured.
                </p>
              </div>
            )}

            {showChainForm && (
              <div className="mt-3 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
                <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                  Chain Configuration (JSON)
                </label>
                <textarea
                  className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                  rows={4}
                  value={chainInput}
                  onChange={(e) => setChainInput(e.target.value)}
                  placeholder='{"levels": [{"approver": "...", "timeout": 300}]}'
                />
                <div className="mt-3 flex gap-2">
                  <Button variant="filled" onClick={handleSaveChain}>
                    Save Chain
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowChainForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Escalate action */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                Escalate Approval
              </label>
              <textarea
                className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                rows={2}
                value={escalateInput}
                onChange={(e) => setEscalateInput(e.target.value)}
                placeholder='{"approvalId": "...", "reason": "..."}'
              />
              <Button
                variant="secondary"
                onClick={handleEscalate}
                disabled={escalating}
                className="mt-2"
              >
                {escalating ? 'Escalating...' : 'Escalate'}
              </Button>
            </div>

            {chainMsg && (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                {chainMsg}
              </p>
            )}
          </section>

          {/* ---- Break-Glass ---- */}
          <section id="break-glass" className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                Break-Glass Access
              </h2>
              <Button
                variant="filled"
                onClick={() =>
                  setShowBreakGlassConfirm(!showBreakGlassConfirm)
                }
              >
                Execute Break-Glass
              </Button>
            </div>

            {showBreakGlassConfirm && (
              <div className="mt-3 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
                <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                  Break-Glass Parameters (JSON)
                </label>
                <textarea
                  className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                  rows={3}
                  value={breakGlassInput}
                  onChange={(e) => setBreakGlassInput(e.target.value)}
                  placeholder='{"reason": "...", "scope": "..."}'
                />
                <ConfirmDialog
                  title="Confirm Break-Glass Execution"
                  message="This will grant emergency elevated access. This action is audited and requires post-incident review."
                  onConfirm={handleExecuteBreakGlass}
                  onCancel={() => setShowBreakGlassConfirm(false)}
                />
              </div>
            )}

            {breakGlassMsg && (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                {breakGlassMsg}
              </p>
            )}

            {breakGlassLoading && !breakGlassEvents ? (
              <div className="mt-4">
                <SkeletonList />
              </div>
            ) : breakGlassEvents && breakGlassEvents.length > 0 ? (
              <div className="mt-4 space-y-3">
                {breakGlassEvents.map((evt, idx) => (
                  <div
                    key={evt.id ?? idx}
                    className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-950 dark:text-white">
                          {evt.reason ?? evt.action ?? `Event ${idx + 1}`}
                        </span>
                        {evt.status && (
                          <Tag
                            color={
                              evt.status === 'reviewed'
                                ? 'orange'
                                : evt.status === 'pending_review'
                                  ? 'amber'
                                  : 'rose'
                            }
                            variant="medium"
                          >
                            {evt.status.toUpperCase()}
                          </Tag>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {evt.timestamp && (
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {new Date(evt.timestamp).toLocaleString()}
                          </span>
                        )}
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setReviewingId(
                              reviewingId === evt.id ? null : evt.id,
                            )
                          }
                        >
                          Review
                        </Button>
                      </div>
                    </div>
                    {evt.actor && (
                      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                        Actor: {evt.actor}
                      </p>
                    )}

                    {reviewingId === evt.id && (
                      <div className="mt-3 rounded-xl border border-zinc-950/5 bg-zinc-50 p-3 dark:border-white/5 dark:bg-zinc-800">
                        <textarea
                          className="w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                          rows={2}
                          value={reviewInput}
                          onChange={(e) => setReviewInput(e.target.value)}
                          placeholder='{"verdict": "approved", "notes": "..."}'
                        />
                        <div className="mt-2 flex gap-2">
                          <Button
                            variant="filled"
                            onClick={() => handleReviewBreakGlass(evt.id)}
                          >
                            Submit Review
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => setReviewingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No break-glass events recorded.
                </p>
              </div>
            )}
          </section>

          {/* ---- Step-Up Auth ---- */}
          <section id="step-up-auth" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Step-Up Authentication
            </h2>

            {/* Status card */}
            {stepUpLoading && !stepUpStatus ? (
              <div className="mt-4">
                <SkeletonCard />
              </div>
            ) : stepUpStatus ? (
              <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-950 dark:text-white">
                    Status
                  </span>
                  <Tag
                    color={
                      stepUpStatus.authenticated || stepUpStatus.verified
                        ? 'orange'
                        : 'zinc'
                    }
                    variant="medium"
                  >
                    {stepUpStatus.authenticated || stepUpStatus.verified
                      ? 'VERIFIED'
                      : 'NOT VERIFIED'}
                  </Tag>
                </div>
                {stepUpStatus.expiresAt && (
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Expires: {new Date(stepUpStatus.expiresAt).toLocaleString()}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Step-up status not available.
                </p>
              </div>
            )}

            {/* Challenge */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                Create Challenge
              </label>
              <textarea
                className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                rows={2}
                value={challengeInput}
                onChange={(e) => setChallengeInput(e.target.value)}
                placeholder='{"method": "totp"}'
              />
              <Button
                variant="secondary"
                onClick={handleCreateChallenge}
                className="mt-2"
              >
                Create Challenge
              </Button>
              {challengeResult && (
                <div className="mt-2 rounded-lg border border-zinc-950/5 bg-zinc-50 p-3 dark:border-white/5 dark:bg-zinc-800">
                  {challengeResult.error ? (
                    <p className="text-sm text-rose-600 dark:text-rose-400">
                      {challengeResult.error}
                    </p>
                  ) : (
                    <pre className="max-h-32 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
                      {JSON.stringify(challengeResult, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>

            {/* Verify */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                Verify Challenge
              </label>
              <textarea
                className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                rows={2}
                value={verifyInput}
                onChange={(e) => setVerifyInput(e.target.value)}
                placeholder='{"challengeId": "...", "code": "123456"}'
              />
              <Button
                variant="secondary"
                onClick={handleVerifyChallenge}
                className="mt-2"
              >
                Verify
              </Button>
              {verifyResult && (
                <div className="mt-2 rounded-lg border border-zinc-950/5 bg-zinc-50 p-3 dark:border-white/5 dark:bg-zinc-800">
                  {verifyResult.error ? (
                    <p className="text-sm text-rose-600 dark:text-rose-400">
                      {verifyResult.error}
                    </p>
                  ) : (
                    <pre className="max-h-32 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
                      {JSON.stringify(verifyResult, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </article>
  )
}
