'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadJson, postJson } from '@/lib/api'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'
import { SkeletonList } from '@/components/Skeleton'

export default function ToolPolicies() {
  const [policies, setPolicies] = useState(null)
  const [policiesLoading, setPoliciesLoading] = useState(true)
  const [policiesError, setPoliciesError] = useState(null)
  const [validateInput, setValidateInput] = useState('')
  const [validateResult, setValidateResult] = useState(null)

  const fetchData = useCallback(async () => {
    setPoliciesLoading(true)
    setPoliciesError(null)
    try {
      const data = await loadJson('/api/tools/policies')
      setPolicies(Array.isArray(data) ? data : data.policies ?? data.items ?? [])
    } catch (err) { setPoliciesError(err.message) }
    finally { setPoliciesLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleValidatePolicy() {
    setValidateResult(null)
    try {
      const body = validateInput.trim() ? JSON.parse(validateInput) : {}
      setValidateResult(await postJson('/api/tools/policies/validate', body))
    } catch (err) { setValidateResult({ error: err.message }) }
  }

  return (
    <section id="tool-policies" className="mt-10">
      <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Tool Policies</h2>

      {policiesLoading && !policies ? (
        <div className="mt-4"><SkeletonList /></div>
      ) : policies && policies.length > 0 ? (
        <div className="mt-4 space-y-3">
          {policies.map((policy, idx) => (
            <div key={policy.id ?? idx} className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-950 dark:text-white">{policy.name ?? policy.id ?? `Policy ${idx + 1}`}</span>
                {policy.action && <Tag color={policy.action === 'allow' ? 'orange' : 'rose'} variant="small">{policy.action.toUpperCase()}</Tag>}
              </div>
              {policy.description && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{policy.description}</p>}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No tool policies found.</p>
        </div>
      )}

      <div className="mt-4">
        <label className="block text-sm font-medium text-zinc-950 dark:text-white">Validate Policy (JSON)</label>
        <textarea className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white" rows={3} value={validateInput} onChange={(e) => setValidateInput(e.target.value)} placeholder='{"policy": {...}}' />
        <Button variant="secondary" onClick={handleValidatePolicy} className="mt-2">Validate</Button>
        {validateResult && (
          <div className="mt-2 rounded-lg border border-zinc-950/5 bg-zinc-50 p-3 dark:border-white/5 dark:bg-zinc-800">
            {validateResult.error ? (
              <p className="text-sm text-rose-600 dark:text-rose-400">{validateResult.error}</p>
            ) : (
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(validateResult, null, 2)}</pre>
            )}
          </div>
        )}
      </div>

      {policiesError && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm text-amber-800 dark:text-amber-300">Could not load policies: {policiesError}</p>
        </div>
      )}
    </section>
  )
}
