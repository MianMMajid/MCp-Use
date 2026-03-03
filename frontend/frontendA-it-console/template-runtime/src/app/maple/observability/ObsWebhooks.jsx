'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadJson, postJson, deleteJson } from '@/lib/api'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'
import { SkeletonList } from '@/components/Skeleton'
import { ConfirmDialog } from '@/components/ConfirmDialog'

export default function ObsWebhooks() {
  const [webhooks, setWebhooks] = useState(null)
  const [webhooksLoading, setWebhooksLoading] = useState(true)
  const [showWebhookForm, setShowWebhookForm] = useState(false)
  const [webhookInput, setWebhookInput] = useState('')
  const [webhookMsg, setWebhookMsg] = useState(null)
  const [expandedWebhookId, setExpandedWebhookId] = useState(null)
  const [deliveries, setDeliveries] = useState(null)
  const [deliveriesLoading, setDeliveriesLoading] = useState(false)
  const [confirmDeleteWebhookId, setConfirmDeleteWebhookId] = useState(null)

  const fetchData = useCallback(async () => {
    setWebhooksLoading(true)
    try {
      const data = await loadJson('/api/observability/orchestrations/alert-webhooks')
      setWebhooks(Array.isArray(data) ? data : data.webhooks ?? data.items ?? [])
    } catch { /* non-critical */ }
    finally { setWebhooksLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!webhookMsg) return
    const t = setTimeout(() => setWebhookMsg(null), 5000)
    return () => clearTimeout(t)
  }, [webhookMsg])

  async function handleAddWebhook() {
    setWebhookMsg(null)
    try {
      const body = webhookInput.trim() ? JSON.parse(webhookInput) : {}
      await postJson('/api/observability/orchestrations/alert-webhooks', body)
      setWebhookMsg('Webhook registered.')
      setWebhookInput('')
      setShowWebhookForm(false)
      fetchData()
    } catch (err) { setWebhookMsg(`Failed: ${err.message}`) }
  }

  async function handleDeleteWebhook(id) {
    try { await deleteJson(`/api/observability/orchestrations/alert-webhooks/${id}`); fetchData() }
    catch (err) { setWebhookMsg(`Delete failed: ${err.message}`) }
  }

  async function handleViewDeliveries(id) {
    if (expandedWebhookId === id) { setExpandedWebhookId(null); setDeliveries(null); return }
    setExpandedWebhookId(id)
    setDeliveriesLoading(true)
    try {
      const data = await loadJson(`/api/observability/orchestrations/alert-webhooks/${id}/deliveries`)
      setDeliveries(Array.isArray(data) ? data : data.deliveries ?? data.items ?? [])
    } catch { setDeliveries(null) }
    finally { setDeliveriesLoading(false) }
  }

  return (
    <section id="alert-webhooks" className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Alert Webhooks</h2>
        <Button variant="secondary" onClick={() => setShowWebhookForm(!showWebhookForm)}>Add Webhook</Button>
      </div>

      {showWebhookForm && (
        <div className="mt-3 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
          <label className="block text-sm font-medium text-zinc-950 dark:text-white">Webhook Configuration (JSON)</label>
          <textarea className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white" rows={3} value={webhookInput} onChange={(e) => setWebhookInput(e.target.value)} placeholder='{"url": "https://...", "events": ["alert.*"]}' />
          <div className="mt-3 flex gap-2">
            <Button variant="filled" onClick={handleAddWebhook}>Register</Button>
            <Button variant="secondary" onClick={() => setShowWebhookForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {webhookMsg && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{webhookMsg}</p>}

      {webhooksLoading && !webhooks ? (
        <div className="mt-4"><SkeletonList /></div>
      ) : webhooks && webhooks.length > 0 ? (
        <div className="mt-4 space-y-3">
          {webhooks.map((wh, idx) => (
            <div key={wh.id ?? idx}>
              <div className="flex items-center justify-between rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900">
                <div>
                  <span className="text-sm font-medium text-zinc-950 dark:text-white">{wh.url ?? wh.name ?? wh.id ?? `Webhook ${idx + 1}`}</span>
                  {wh.status && <Tag color={wh.status === 'active' ? 'orange' : 'zinc'} variant="small">{wh.status.toUpperCase()}</Tag>}
                </div>
                <div className="flex gap-1">
                  <Button variant="secondary" onClick={() => handleViewDeliveries(wh.id)}>Deliveries</Button>
                  <Button variant="secondary" onClick={() => setConfirmDeleteWebhookId(wh.id)}>Delete</Button>
                </div>
              </div>
              {expandedWebhookId === wh.id && (
                <div className="ml-4 mt-2 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                  {deliveriesLoading ? <SkeletonList /> : deliveries && deliveries.length > 0 ? (
                    <div className="space-y-2">
                      {deliveries.map((d, i) => (
                        <div key={d.id ?? i} className="flex items-center justify-between text-sm">
                          <span className="text-zinc-950 dark:text-white">{d.event ?? d.type ?? `Delivery ${i + 1}`}</span>
                          <div className="flex items-center gap-2">
                            {d.statusCode && <Tag color={d.statusCode >= 200 && d.statusCode < 300 ? 'orange' : 'rose'} variant="small">{d.statusCode}</Tag>}
                            {d.timestamp && <span className="text-xs text-zinc-400 dark:text-zinc-500">{new Date(d.timestamp).toLocaleString()}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-zinc-500 dark:text-zinc-400">No delivery history.</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No alert webhooks configured.</p>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteWebhookId !== null}
        title="Delete Webhook"
        message="Are you sure you want to delete this webhook? This cannot be undone."
        onConfirm={() => { handleDeleteWebhook(confirmDeleteWebhookId); setConfirmDeleteWebhookId(null) }}
        onCancel={() => setConfirmDeleteWebhookId(null)}
      />
    </section>
  )
}
