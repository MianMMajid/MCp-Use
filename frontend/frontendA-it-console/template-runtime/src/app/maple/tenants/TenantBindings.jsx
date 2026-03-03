'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadJson, postJson, deleteJson } from '@/lib/api'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'
import { SkeletonList } from '@/components/Skeleton'

export default function TenantBindings() {
  const [bindings, setBindings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showBindingForm, setShowBindingForm] = useState(false)
  const [bindingInput, setBindingInput] = useState('')
  const [bindingMsg, setBindingMsg] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await loadJson('/api/operations/orchestrations/tenant-bindings')
      setBindings(Array.isArray(data) ? data : data.bindings ?? data.items ?? [])
    } catch { /* non-critical */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!bindingMsg) return
    const t = setTimeout(() => setBindingMsg(null), 5000)
    return () => clearTimeout(t)
  }, [bindingMsg])

  async function handleAddBinding() {
    setBindingMsg(null)
    try {
      const body = bindingInput.trim() ? JSON.parse(bindingInput) : {}
      await postJson('/api/operations/orchestrations/tenant-bindings', body)
      setBindingMsg('Binding created.')
      setBindingInput('')
      setShowBindingForm(false)
      fetchData()
    } catch (err) { setBindingMsg(`Failed: ${err.message}`) }
  }

  async function handleRemoveBinding() {
    try { await deleteJson('/api/operations/orchestrations/tenant-bindings'); fetchData() }
    catch (err) { setBindingMsg(`Remove failed: ${err.message}`) }
  }

  return (
    <section id="tenant-bindings" className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Tenant Bindings</h2>
        <Button variant="secondary" onClick={() => setShowBindingForm(!showBindingForm)}>Add Binding</Button>
      </div>

      {showBindingForm && (
        <div className="mt-3 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
          <label className="block text-sm font-medium text-zinc-950 dark:text-white">Binding Configuration (JSON)</label>
          <textarea className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white" rows={3} value={bindingInput} onChange={(e) => setBindingInput(e.target.value)} placeholder='{"tenantId": "...", "target": "..."}' />
          <div className="mt-3 flex gap-2">
            <Button variant="filled" onClick={handleAddBinding}>Create</Button>
            <Button variant="secondary" onClick={() => setShowBindingForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {bindingMsg && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{bindingMsg}</p>}

      {loading && !bindings ? (
        <div className="mt-4"><SkeletonList /></div>
      ) : bindings && bindings.length > 0 ? (
        <div className="mt-4 space-y-3">
          {bindings.map((b, idx) => (
            <div key={b.id ?? idx} className="flex items-center justify-between rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900">
              <div>
                <span className="text-sm font-medium text-zinc-950 dark:text-white">{b.tenantId ?? b.name ?? b.id ?? `Binding ${idx + 1}`}</span>
                {b.target && <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">→ {b.target}</span>}
                {b.status && <Tag color={b.status === 'active' ? 'orange' : 'zinc'} variant="small">{b.status.toUpperCase()}</Tag>}
              </div>
              <Button variant="secondary" onClick={() => handleRemoveBinding(b)}>Remove</Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No tenant bindings found.</p>
        </div>
      )}
    </section>
  )
}
