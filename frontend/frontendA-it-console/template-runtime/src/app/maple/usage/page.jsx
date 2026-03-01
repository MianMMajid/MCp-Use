'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Entitlements', id: 'entitlements' },
  { title: 'Usage summary', id: 'usage-summary' },
  { title: 'Limits', id: 'limits' },
  { title: 'Billing', id: 'billing' },
  { title: 'Invoices', id: 'invoices' },
  { title: 'Limits override', id: 'limits-override' },
]

async function loadJson(path) {
  const res = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

async function postJson(path, body) {
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 h-8 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
    </div>
  )
}

function formatDate(d) {
  if (!d) return '--'
  try { return new Date(d).toLocaleString() } catch { return d }
}

export default function UsagePage() {
  const [entitlements, setEntitlements] = useState(null)
  const [summary, setSummary] = useState(null)
  const [limits, setLimits] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [invoices, setInvoices] = useState(null)
  const [timeseries, setTimeseries] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState('')
  const [actionLoading, setActionLoading] = useState('')
  const [tsWindow, setTsWindow] = useState('24h')
  const [overrideInput, setOverrideInput] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [e, s, l, sub, inv] = await Promise.allSettled([
        loadJson('/api/entitlements'),
        loadJson('/api/usage/summary'),
        loadJson('/api/limits'),
        loadJson('/api/billing/subscription'),
        loadJson('/api/billing/invoices'),
      ])
      if (e.status === 'fulfilled') setEntitlements(e.value)
      if (s.status === 'fulfilled') setSummary(s.value)
      if (l.status === 'fulfilled') setLimits(l.value)
      if (sub.status === 'fulfilled') setSubscription(sub.value)
      if (inv.status === 'fulfilled') setInvoices(Array.isArray(inv.value?.invoices) ? inv.value.invoices : Array.isArray(inv.value) ? inv.value : [])
      const allRejected = [e, s, l, sub, inv].every((r) => r.status === 'rejected')
      if (allRejected) throw new Error('All endpoints failed')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function fetchTimeseries() {
    setActionLoading('timeseries')
    try {
      const data = await loadJson(`/api/usage/timeseries?window=${tsWindow}`)
      setTimeseries(data)
    } catch (err) { setMessage(`Timeseries failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function handlePortal() {
    setActionLoading('portal')
    try {
      const data = await postJson('/api/billing/portal-session', {})
      if (data.url) window.open(data.url, '_blank')
      else setMessage('Portal session created')
    } catch (err) { setMessage(`Portal failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function handleCheckout() {
    setActionLoading('checkout')
    try {
      const data = await postJson('/api/billing/create-checkout-session', {})
      if (data.url) window.open(data.url, '_blank')
      else setMessage('Checkout session created')
    } catch (err) { setMessage(`Checkout failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function handleCancel() {
    setActionLoading('cancel')
    try {
      await postJson('/api/billing/subscription/cancel', {})
      setMessage('Subscription cancellation requested')
      fetchData()
    } catch (err) { setMessage(`Cancel failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function handleLimitsOverride() {
    if (!overrideInput.trim()) return
    setActionLoading('override')
    try {
      let body
      try { body = JSON.parse(overrideInput) } catch { body = { override: overrideInput } }
      await postJson('/api/limits/override', body)
      setMessage('Limits override applied')
      fetchData()
    } catch (err) { setMessage(`Override failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function handleResume() {
    setActionLoading('resume')
    try {
      await postJson('/api/billing/subscription/resume', {})
      setMessage('Subscription resumed')
      fetchData()
    } catch (err) { setMessage(`Resume failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Usage & Billing</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">View entitlements, usage, limits, and manage your subscription.</p>
            </div>
            <Button variant="filled" onClick={fetchData}>Refresh</Button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
            </div>
          )}
          {message && <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300">{message}</p>}

          {/* Entitlements */}
          <section id="entitlements" className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Entitlements</h2>
            {loading ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
            ) : entitlements ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {Object.entries(entitlements).filter(([k]) => k !== 'ok' && k !== '_cached').map(([key, val]) => (
                  <div key={key} className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                    <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{key}</span>
                    <p className="mt-2 text-2xl font-bold text-zinc-950 dark:text-white">{typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val)}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {/* Usage Summary */}
          <section id="usage-summary" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Usage summary</h2>
            {!loading && summary ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {Object.entries(summary).filter(([k]) => k !== 'ok' && k !== '_cached').map(([key, val]) => (
                  <div key={key} className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                    <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{key}</span>
                    <p className="mt-2 text-2xl font-bold text-zinc-950 dark:text-white">{typeof val === 'number' ? val.toLocaleString() : String(val)}</p>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-4 flex items-center gap-2">
              <select className="rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-white" value={tsWindow} onChange={(e) => setTsWindow(e.target.value)}>
                <option value="1h">1 hour</option>
                <option value="6h">6 hours</option>
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
              </select>
              <Button variant="secondary" disabled={actionLoading === 'timeseries'} onClick={fetchTimeseries}>
                {actionLoading === 'timeseries' ? 'Loading...' : 'Load Timeseries'}
              </Button>
            </div>
            {timeseries && (
              <div className="mt-4 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                <pre className="max-h-48 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(timeseries, null, 2)}</pre>
              </div>
            )}
          </section>

          {/* Limits */}
          <section id="limits" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Limits</h2>
            {!loading && limits ? (
              <div className="mt-4 rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <pre className="overflow-auto text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(limits, null, 2)}</pre>
              </div>
            ) : !loading ? <p className="mt-4 text-sm text-zinc-500">No limit data.</p> : null}
          </section>

          {/* Billing */}
          <section id="billing" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Billing</h2>
            {!loading && subscription ? (
              <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Plan</span>
                  <Tag color="orange" variant="medium">{subscription.plan || subscription.planId || '--'}</Tag>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Status</span>
                  <Tag color={subscription.status === 'active' ? 'orange' : 'zinc'} variant="medium">{subscription.status || '--'}</Tag>
                </div>
                {subscription.currentPeriodEnd && (
                  <p className="mt-2 text-xs text-zinc-500">Period ends: {formatDate(subscription.currentPeriodEnd)}</p>
                )}
                <div className="mt-4 flex gap-2">
                  <Button variant="filled" disabled={actionLoading === 'portal'} onClick={handlePortal}>
                    {actionLoading === 'portal' ? 'Opening...' : 'Billing Portal'}
                  </Button>
                  <Button variant="secondary" disabled={actionLoading === 'checkout'} onClick={handleCheckout}>
                    {actionLoading === 'checkout' ? 'Opening...' : 'Upgrade'}
                  </Button>
                  {subscription.status === 'active' && (
                    <Button variant="secondary" disabled={actionLoading === 'cancel'} onClick={handleCancel}>
                      {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel'}
                    </Button>
                  )}
                  {(subscription.status === 'canceled' || subscription.status === 'cancelled') && (
                    <Button variant="secondary" disabled={actionLoading === 'resume'} onClick={handleResume}>
                      {actionLoading === 'resume' ? 'Resuming...' : 'Resume'}
                    </Button>
                  )}
                </div>
              </div>
            ) : !loading ? <p className="mt-4 text-sm text-zinc-500">No subscription data.</p> : null}
          </section>

          {/* Invoices */}
          <section id="invoices" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Invoices</h2>
            {!loading && invoices && invoices.length > 0 ? (
              <div className="mt-4 space-y-2">
                {invoices.map((inv, idx) => (
                  <div key={inv.id || idx} className="flex items-center justify-between rounded-xl border border-zinc-950/10 bg-white px-4 py-2 dark:border-white/10 dark:bg-zinc-900">
                    <div>
                      <span className="text-sm font-medium text-zinc-950 dark:text-white">{inv.number || inv.id || `Invoice ${idx + 1}`}</span>
                      <span className="ml-2 text-xs text-zinc-500">{formatDate(inv.date || inv.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-950 dark:text-white">{inv.amount != null ? `$${(inv.amount / 100).toFixed(2)}` : inv.total || '--'}</span>
                      <Tag color={inv.status === 'paid' ? 'orange' : 'zinc'} variant="small">{inv.status || '--'}</Tag>
                      {inv.url && <a href={inv.url} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 hover:underline">View</a>}
                    </div>
                  </div>
                ))}
              </div>
            ) : !loading ? <p className="mt-4 text-sm text-zinc-500">No invoices.</p> : null}
          </section>

          {/* Limits Override (POST /api/limits/override) */}
          <section id="limits-override" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Limits override</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Override rate limits or usage limits (admin only).</p>
            <div className="mt-4">
              <textarea
                className="w-full rounded-xl border border-zinc-950/10 bg-white px-4 py-3 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                rows={3}
                value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value)}
                placeholder='{"limit": "requests_per_minute", "value": 1000}'
              />
              <Button className="mt-3" variant="filled" disabled={!overrideInput.trim() || actionLoading === 'override'} onClick={handleLimitsOverride}>
                {actionLoading === 'override' ? 'Applying...' : 'Apply Override'}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </article>
  )
}
