'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'API keys', id: 'api-keys' },
  { title: 'Service accounts', id: 'service-accounts' },
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

async function deleteJson(path) {
  const res = await fetch(path, { method: 'DELETE', credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

function formatDate(d) {
  if (!d) return '--'
  try { return new Date(d).toLocaleString() } catch { return d }
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

export default function ApiKeysPage() {
  const [keys, setKeys] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState('')
  const [actionLoading, setActionLoading] = useState('')

  // Create key form
  const [keyName, setKeyName] = useState('')
  const [newKeyResult, setNewKeyResult] = useState(null)

  // Service accounts
  const [orgId, setOrgId] = useState('')
  const [serviceAccounts, setServiceAccounts] = useState(null)
  const [expandedSA, setExpandedSA] = useState(null)
  const [saKeys, setSaKeys] = useState(null)
  const [newSaName, setNewSaName] = useState('')

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadJson('/api/user/api-keys')
      setKeys(Array.isArray(data?.items) ? data.items : Array.isArray(data?.keys) ? data.keys : Array.isArray(data) ? data : [])
    } catch (err) { setError(err.message); setKeys([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  async function createKey() {
    if (!keyName.trim()) return
    setActionLoading('create')
    setNewKeyResult(null)
    try {
      const data = await postJson('/api/user/api-keys', { name: keyName })
      setNewKeyResult(data)
      setMessage('API key created. Copy it now — it will not be shown again.')
      setKeyName('')
      fetchKeys()
    } catch (err) { setMessage(`Create failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function deleteKey(keyId) {
    setActionLoading(`delete-${keyId}`)
    try {
      await deleteJson(`/api/user/api-keys/${encodeURIComponent(keyId)}`)
      setMessage('API key deleted')
      fetchKeys()
    } catch (err) { setMessage(`Delete failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function fetchServiceAccounts() {
    if (!orgId.trim()) return
    setActionLoading('load-sa')
    try {
      const data = await loadJson(`/api/org/${encodeURIComponent(orgId)}/service-accounts`)
      setServiceAccounts(Array.isArray(data?.items) ? data.items : Array.isArray(data?.serviceAccounts) ? data.serviceAccounts : Array.isArray(data) ? data : [])
    } catch (err) { setMessage(`Load failed: ${err.message}`); setServiceAccounts([]) }
    finally { setActionLoading('') }
  }

  async function createServiceAccount() {
    if (!orgId.trim() || !newSaName.trim()) return
    setActionLoading('create-sa')
    try {
      await postJson(`/api/org/${encodeURIComponent(orgId)}/service-accounts`, { name: newSaName })
      setMessage('Service account created')
      setNewSaName('')
      fetchServiceAccounts()
    } catch (err) { setMessage(`Create failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function toggleSAKeys(saId) {
    if (expandedSA === saId) { setExpandedSA(null); setSaKeys(null); return }
    setExpandedSA(saId)
    try {
      const data = await loadJson(`/api/org/${encodeURIComponent(orgId)}/service-accounts/${encodeURIComponent(saId)}/keys`)
      setSaKeys(Array.isArray(data?.items) ? data.items : Array.isArray(data?.keys) ? data.keys : Array.isArray(data) ? data : [])
    } catch { setSaKeys([]) }
  }

  async function createSAKey(saId) {
    setActionLoading(`create-sa-key-${saId}`)
    try {
      const data = await postJson(`/api/org/${encodeURIComponent(orgId)}/service-accounts/${encodeURIComponent(saId)}/keys`, {})
      setMessage('Service account key created')
      setNewKeyResult(data)
      toggleSAKeys(saId)
    } catch (err) { setMessage(`Create failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function deleteSAKey(saId, keyId) {
    setActionLoading(`delete-sa-key-${keyId}`)
    try {
      await deleteJson(`/api/org/${encodeURIComponent(orgId)}/service-accounts/${encodeURIComponent(saId)}/keys/${encodeURIComponent(keyId)}`)
      setMessage('Service account key deleted')
      toggleSAKeys(saId)
    } catch (err) { setMessage(`Delete failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">API Keys & Service Accounts</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Manage personal API keys and organization service accounts.</p>
            </div>
            <Button variant="filled" onClick={fetchKeys}>Refresh</Button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
            </div>
          )}
          {message && <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300">{message}</p>}

          {newKeyResult && (newKeyResult.key || newKeyResult.secret || newKeyResult.token) && (
            <div className="mt-4 rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 dark:border-orange-800 dark:bg-orange-950/40">
              <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">New key (copy now):</p>
              <pre className="mt-1 overflow-auto text-xs text-orange-700 dark:text-orange-400">{typeof newKeyResult.key === 'object' ? (newKeyResult.key?.token || JSON.stringify(newKeyResult.key)) : (newKeyResult.key || newKeyResult.secret || newKeyResult.token)}</pre>
            </div>
          )}

          {/* API Keys */}
          <section id="api-keys" className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">API keys</h2>
            <div className="mt-4 flex gap-2">
              <input className="flex-1 rounded-xl border border-zinc-950/10 bg-white px-4 py-2 text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-white" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Key name" />
              <Button variant="filled" disabled={!keyName.trim() || actionLoading === 'create'} onClick={createKey}>
                {actionLoading === 'create' ? 'Creating...' : 'Create Key'}
              </Button>
            </div>
            {loading ? <div className="mt-4"><SkeletonList /></div> : keys && keys.length > 0 ? (
              <div className="mt-4 space-y-2">
                {keys.map((k) => {
                  const kid = k.keyId || k.id || ''
                  return (
                    <div key={kid} className="flex items-center justify-between rounded-xl border border-zinc-950/10 bg-white px-4 py-2 dark:border-white/10 dark:bg-zinc-900">
                      <div>
                        <span className="text-sm font-medium text-zinc-950 dark:text-white">{k.name || kid}</span>
                        <span className="ml-2 font-mono text-xs text-zinc-500">{k.prefix || (typeof kid === 'string' ? kid.substring(0, 8) + '...' : '')}</span>
                        <span className="ml-2 text-xs text-zinc-400">{formatDate(k.createdAt)}</span>
                      </div>
                      <Button variant="secondary" disabled={actionLoading === `delete-${kid}`} onClick={() => deleteKey(kid)}>
                        {actionLoading === `delete-${kid}` ? 'Deleting...' : 'Delete'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="mt-4 text-sm text-zinc-500">No API keys.</p>
            )}
          </section>

          {/* Service Accounts */}
          <section id="service-accounts" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Service accounts</h2>
            <div className="mt-4 flex gap-2">
              <input className="flex-1 rounded-xl border border-zinc-950/10 bg-white px-4 py-2 text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-white" value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="Organization ID" />
              <Button variant="filled" disabled={!orgId.trim() || actionLoading === 'load-sa'} onClick={fetchServiceAccounts}>
                {actionLoading === 'load-sa' ? 'Loading...' : 'Load'}
              </Button>
            </div>

            {serviceAccounts && (
              <>
                <div className="mt-4 flex gap-2">
                  <input className="flex-1 rounded-xl border border-zinc-950/10 bg-white px-4 py-2 text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-white" value={newSaName} onChange={(e) => setNewSaName(e.target.value)} placeholder="New service account name" />
                  <Button variant="filled" disabled={!newSaName.trim() || actionLoading === 'create-sa'} onClick={createServiceAccount}>
                    {actionLoading === 'create-sa' ? 'Creating...' : 'Create'}
                  </Button>
                </div>

                {serviceAccounts.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {serviceAccounts.map((sa) => {
                      const saId = sa.id || sa.serviceAccountId || ''
                      return (
                        <div key={saId} className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900">
                          <div className="flex items-center justify-between">
                            <button type="button" onClick={() => toggleSAKeys(saId)} className="flex items-center gap-2">
                              <span className="text-sm font-medium text-zinc-950 dark:text-white">{sa.name || saId}</span>
                              <Tag color="zinc" variant="small">{sa.status || 'active'}</Tag>
                            </button>
                            <Button variant="secondary" disabled={actionLoading === `create-sa-key-${saId}`} onClick={() => createSAKey(saId)}>
                              {actionLoading === `create-sa-key-${saId}` ? 'Creating...' : 'New Key'}
                            </Button>
                          </div>
                          {expandedSA === saId && saKeys && (
                            <div className="mt-3 space-y-1">
                              {saKeys.length > 0 ? saKeys.map((k) => {
                                const skid = k.keyId || k.id || ''
                                return (
                                  <div key={skid} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1 dark:bg-zinc-800">
                                    <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{k.prefix || (typeof skid === 'string' ? skid.substring(0, 8) + '...' : '')}</span>
                                    <Button variant="secondary" disabled={actionLoading === `delete-sa-key-${skid}`} onClick={() => deleteSAKey(saId, skid)}>Delete</Button>
                                  </div>
                                )
                              }) : <p className="text-xs text-zinc-500">No keys.</p>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : <p className="mt-4 text-sm text-zinc-500">No service accounts.</p>}
              </>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
