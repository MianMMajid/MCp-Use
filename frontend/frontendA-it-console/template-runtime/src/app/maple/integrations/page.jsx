'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Catalog', id: 'catalog' },
  { title: 'Connected integrations', id: 'connected' },
  { title: 'OAuth actions', id: 'oauth-actions' },
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

function SkeletonList() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
            <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function IntegrationsPage() {
  const [catalog, setCatalog] = useState(null)
  const [integrations, setIntegrations] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState('')
  const [actionLoading, setActionLoading] = useState('')

  const [oauthProvider, setOauthProvider] = useState('')
  const [oauthResult, setOauthResult] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, i] = await Promise.allSettled([
        loadJson('/api/integrations/catalog'),
        loadJson('/api/integrations'),
      ])
      if (c.status === 'fulfilled') setCatalog(Array.isArray(c.value?.providers) ? c.value.providers : Array.isArray(c.value?.integrations) ? c.value.integrations : Array.isArray(c.value?.catalog) ? c.value.catalog : Array.isArray(c.value) ? c.value : [])
      if (i.status === 'fulfilled') setIntegrations(Array.isArray(i.value?.items) ? i.value.items : Array.isArray(i.value?.integrations) ? i.value.integrations : Array.isArray(i.value) ? i.value : [])
      if (c.status === 'rejected' && i.status === 'rejected') throw new Error('All endpoints failed')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleConnect(provider) {
    const apiKey = window.prompt(`Enter API key or credential for ${provider}:`)
    if (!apiKey) return
    setActionLoading(`connect-${provider}`)
    try {
      await postJson(`/api/integrations/${encodeURIComponent(provider)}/connect`, { credential: apiKey, apiKey })
      setMessage(`Connected to ${provider}`)
      fetchData()
    } catch (err) { setMessage(`Connect failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function handleDisconnect(provider) {
    setActionLoading(`disconnect-${provider}`)
    try {
      await postJson(`/api/integrations/${encodeURIComponent(provider)}/disconnect`, {})
      setMessage(`Disconnected from ${provider}`)
      fetchData()
    } catch (err) { setMessage(`Disconnect failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function handleOAuthAction(action) {
    if (!oauthProvider.trim()) return
    setActionLoading(`oauth-${action}`)
    setOauthResult(null)
    try {
      if (action === 'start') {
        const data = await loadJson(`/api/integrations/${encodeURIComponent(oauthProvider)}/oauth/start`)
        setOauthResult(data)
      } else {
        const data = await postJson(`/api/integrations/${encodeURIComponent(oauthProvider)}/oauth/${action}`, {})
        setOauthResult(data)
      }
      setMessage(`OAuth ${action} completed`)
    } catch (err) { setOauthResult({ error: err.message }); setMessage(`OAuth ${action} failed`) }
    finally { setActionLoading('') }
  }

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Integrations</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Browse the catalog, connect providers, and manage OAuth flows.</p>
            </div>
            <Button variant="filled" onClick={fetchData}>Refresh</Button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
            </div>
          )}
          {message && <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300">{message}</p>}

          {/* Catalog */}
          <section id="catalog" className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Catalog</h2>
            {loading ? <div className="mt-4"><SkeletonList /></div> : catalog && catalog.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {catalog.map((item) => {
                  const provider = item.provider || item.name || item.id || ''
                  return (
                    <div key={provider} className="rounded-2xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                      <span className="text-sm font-semibold text-zinc-950 dark:text-white">{item.name || provider}</span>
                      {item.description && <p className="mt-1 text-xs text-zinc-500">{item.description}</p>}
                      <div className="mt-2 flex gap-2">
                        {item.category && <Tag color="zinc" variant="small">{item.category}</Tag>}
                        {item.status && <Tag color={item.status === 'available' ? 'orange' : 'zinc'} variant="small">{item.status}</Tag>}
                      </div>
                      <Button className="mt-3 w-full" variant="filled" disabled={actionLoading === `connect-${provider}`} onClick={() => handleConnect(provider)}>
                        {actionLoading === `connect-${provider}` ? 'Connecting...' : 'Connect'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            ) : !loading ? (
              <p className="mt-4 text-sm text-zinc-500">No integrations in catalog.</p>
            ) : null}
          </section>

          {/* Connected */}
          <section id="connected" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Connected integrations</h2>
            {!loading && integrations && integrations.length > 0 ? (
              <div className="mt-4 space-y-3">
                {integrations.map((item) => {
                  const provider = item.provider || item.name || item.id || ''
                  return (
                    <div key={provider} className="flex items-center justify-between rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-950 dark:text-white">{item.name || provider}</span>
                        <Tag color={item.status === 'connected' || item.status === 'active' ? 'orange' : 'zinc'} variant="medium">{item.status || 'connected'}</Tag>
                      </div>
                      <Button variant="secondary" disabled={actionLoading === `disconnect-${provider}`} onClick={() => handleDisconnect(provider)}>
                        {actionLoading === `disconnect-${provider}` ? 'Disconnecting...' : 'Disconnect'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            ) : !loading ? (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500">No integrations connected.</p>
              </div>
            ) : null}
          </section>

          {/* OAuth Actions */}
          <section id="oauth-actions" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">OAuth actions</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Start, refresh, or revoke OAuth tokens for a provider.</p>
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-950 dark:text-white">Provider</label>
              <input className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-white px-4 py-2 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white" value={oauthProvider} onChange={(e) => setOauthProvider(e.target.value)} placeholder="e.g. github, slack" />
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="filled" disabled={!oauthProvider.trim() || actionLoading.startsWith('oauth-')} onClick={() => handleOAuthAction('start')}>
                {actionLoading === 'oauth-start' ? 'Starting...' : 'Start OAuth'}
              </Button>
              <Button variant="secondary" disabled={!oauthProvider.trim() || actionLoading.startsWith('oauth-')} onClick={() => handleOAuthAction('refresh')}>
                {actionLoading === 'oauth-refresh' ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Button variant="secondary" disabled={!oauthProvider.trim() || actionLoading.startsWith('oauth-')} onClick={() => handleOAuthAction('revoke')}>
                {actionLoading === 'oauth-revoke' ? 'Revoking...' : 'Revoke'}
              </Button>
            </div>
            {oauthResult && (
              <div className="mt-4 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                <pre className="max-h-48 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(oauthResult, null, 2)}</pre>
              </div>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
