'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadJson, postJson, deleteJson } from '@/lib/api'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Tenant bindings', id: 'tenant-bindings' },
  { title: 'Tenant scope', id: 'tenant-scope' },
  { title: 'Org tree', id: 'org-tree' },
  { title: 'Org lifecycle', id: 'org-lifecycle' },
]

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
/*  Org tree renderer                                                  */
/* ------------------------------------------------------------------ */

function OrgTreeNode({ node, depth = 0, onSelect }) {
  const children = node.children ?? node.subOrgs ?? []
  return (
    <div style={{ marginLeft: depth * 16 }}>
      <button
        onClick={() => onSelect(node.id ?? node.orgId)}
        className="w-full rounded-lg px-3 py-1.5 text-left text-sm transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <span className="font-medium text-zinc-950 dark:text-white">
          {node.name ?? node.id ?? node.orgId}
        </span>
        {node.status && (
          <Tag
            color={node.status === 'active' ? 'orange' : 'zinc'}
            variant="small"
          >
            {node.status.toUpperCase()}
          </Tag>
        )}
      </button>
      {children.map((child, idx) => (
        <OrgTreeNode
          key={child.id ?? child.orgId ?? idx}
          node={child}
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function TenantOrgPage() {
  const [bindings, setBindings] = useState(null)
  const [tenantScope, setTenantScope] = useState(null)
  const [orgTree, setOrgTree] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Add binding form
  const [showBindingForm, setShowBindingForm] = useState(false)
  const [bindingInput, setBindingInput] = useState('')
  const [bindingMsg, setBindingMsg] = useState(null)

  // Org detail
  const [selectedOrgId, setSelectedOrgId] = useState(null)
  const [orgDetail, setOrgDetail] = useState(null)
  const [orgDetailLoading, setOrgDetailLoading] = useState(false)
  const [lifecycle, setLifecycle] = useState(null)

  // Create/update org form
  const [showOrgForm, setShowOrgForm] = useState(false)
  const [orgInput, setOrgInput] = useState('')
  const [orgMsg, setOrgMsg] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [b, s, t] = await Promise.allSettled([
        loadJson('/api/openclaw/modifier/ops/tenant-bindings'),
        loadJson('/api/openclaw/modifier/ops/tenant-scope'),
        loadJson('/api/openclaw/modifier/ops/org/tree'),
      ])

      if (b.status === 'fulfilled') {
        const data = b.value
        setBindings(
          Array.isArray(data) ? data : data.bindings ?? data.items ?? [],
        )
      }
      if (s.status === 'fulfilled') setTenantScope(s.value)
      if (t.status === 'fulfilled') setOrgTree(t.value)

      if ([b, s, t].every((r) => r.status === 'rejected'))
        throw new Error('All endpoints failed')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleAddBinding() {
    setBindingMsg(null)
    try {
      const body = bindingInput.trim() ? JSON.parse(bindingInput) : {}
      await postJson('/api/openclaw/modifier/ops/tenant-bindings', body)
      setBindingMsg('Binding created.')
      setBindingInput('')
      setShowBindingForm(false)
      fetchData()
    } catch (err) {
      setBindingMsg(`Failed: ${err.message}`)
    }
  }

  async function handleRemoveBinding(binding) {
    try {
      await deleteJson('/api/openclaw/modifier/ops/tenant-bindings')
      fetchData()
    } catch (err) {
      setBindingMsg(`Remove failed: ${err.message}`)
    }
  }

  async function handleSelectOrg(orgId) {
    setSelectedOrgId(orgId)
    setOrgDetailLoading(true)
    try {
      const [d, l] = await Promise.allSettled([
        loadJson(`/api/openclaw/modifier/ops/org/${orgId}`),
        loadJson(`/api/openclaw/modifier/ops/org/${orgId}/lifecycle`),
      ])
      if (d.status === 'fulfilled') setOrgDetail(d.value)
      if (l.status === 'fulfilled') {
        const data = l.value
        setLifecycle(
          Array.isArray(data) ? data : data.events ?? data.lifecycle ?? [],
        )
      }
    } catch {
      // non-critical
    } finally {
      setOrgDetailLoading(false)
    }
  }

  async function handleCreateOrg() {
    setOrgMsg(null)
    try {
      const body = orgInput.trim() ? JSON.parse(orgInput) : {}
      await postJson('/api/openclaw/modifier/ops/org', body)
      setOrgMsg('Org created/updated.')
      setOrgInput('')
      setShowOrgForm(false)
      fetchData()
    } catch (err) {
      setOrgMsg(`Failed: ${err.message}`)
    }
  }

  async function handleDeactivateOrg(orgId) {
    try {
      await deleteJson(`/api/openclaw/modifier/ops/org/${orgId}`)
      setOrgMsg(`Org ${orgId} deactivated.`)
      setSelectedOrgId(null)
      setOrgDetail(null)
      fetchData()
    } catch (err) {
      setOrgMsg(`Deactivate failed: ${err.message}`)
    }
  }

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Tenant & Org Management
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Manage tenant bindings, organizational hierarchy, and lifecycle
            events.
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

          {/* ---- Tenant Bindings ---- */}
          <section id="tenant-bindings" className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                Tenant Bindings
              </h2>
              <Button
                variant="secondary"
                onClick={() => setShowBindingForm(!showBindingForm)}
              >
                Add Binding
              </Button>
            </div>

            {showBindingForm && (
              <div className="mt-3 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
                <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                  Binding Configuration (JSON)
                </label>
                <textarea
                  className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                  rows={3}
                  value={bindingInput}
                  onChange={(e) => setBindingInput(e.target.value)}
                  placeholder='{"tenantId": "...", "target": "..."}'
                />
                <div className="mt-3 flex gap-2">
                  <Button variant="filled" onClick={handleAddBinding}>
                    Create
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowBindingForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {bindingMsg && (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                {bindingMsg}
              </p>
            )}

            {loading && !bindings ? (
              <div className="mt-4">
                <SkeletonList />
              </div>
            ) : bindings && bindings.length > 0 ? (
              <div className="mt-4 space-y-3">
                {bindings.map((b, idx) => (
                  <div
                    key={b.id ?? idx}
                    className="flex items-center justify-between rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900"
                  >
                    <div>
                      <span className="text-sm font-medium text-zinc-950 dark:text-white">
                        {b.tenantId ?? b.name ?? b.id ?? `Binding ${idx + 1}`}
                      </span>
                      {b.target && (
                        <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                          → {b.target}
                        </span>
                      )}
                      {b.status && (
                        <Tag
                          color={b.status === 'active' ? 'orange' : 'zinc'}
                          variant="small"
                        >
                          {b.status.toUpperCase()}
                        </Tag>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => handleRemoveBinding(b)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No tenant bindings found.
                </p>
              </div>
            )}
          </section>

          {/* ---- Tenant Scope ---- */}
          <section id="tenant-scope" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Tenant Scope
            </h2>

            {loading && !tenantScope ? (
              <div className="mt-4">
                <SkeletonCard />
              </div>
            ) : tenantScope ? (
              <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {tenantScope.tenantId && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Tenant ID
                      </span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">
                        {tenantScope.tenantId}
                      </p>
                    </div>
                  )}
                  {tenantScope.orgId && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Org ID
                      </span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">
                        {tenantScope.orgId}
                      </p>
                    </div>
                  )}
                  {tenantScope.scope && (
                    <div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Scope
                      </span>
                      <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">
                        {tenantScope.scope}
                      </p>
                    </div>
                  )}
                </div>
                {/* Fallback: render raw data */}
                {!tenantScope.tenantId &&
                  !tenantScope.orgId &&
                  !tenantScope.scope && (
                    <pre className="text-xs text-zinc-700 dark:text-zinc-300">
                      {JSON.stringify(tenantScope, null, 2)}
                    </pre>
                  )}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Tenant scope not available.
                </p>
              </div>
            )}
          </section>

          {/* ---- Org Tree ---- */}
          <section id="org-tree" className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                Organization Hierarchy
              </h2>
              <Button
                variant="secondary"
                onClick={() => setShowOrgForm(!showOrgForm)}
              >
                Create Org
              </Button>
            </div>

            {showOrgForm && (
              <div className="mt-3 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
                <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                  Org Data (JSON)
                </label>
                <textarea
                  className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                  rows={3}
                  value={orgInput}
                  onChange={(e) => setOrgInput(e.target.value)}
                  placeholder='{"name": "...", "parentId": "..."}'
                />
                <div className="mt-3 flex gap-2">
                  <Button variant="filled" onClick={handleCreateOrg}>
                    Create / Update
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowOrgForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {orgMsg && (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                {orgMsg}
              </p>
            )}

            {loading && !orgTree ? (
              <div className="mt-4">
                <SkeletonList />
              </div>
            ) : orgTree ? (
              <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                {Array.isArray(orgTree) ? (
                  orgTree.map((node, idx) => (
                    <OrgTreeNode
                      key={node.id ?? node.orgId ?? idx}
                      node={node}
                      onSelect={handleSelectOrg}
                    />
                  ))
                ) : orgTree.root ? (
                  <OrgTreeNode node={orgTree.root} onSelect={handleSelectOrg} />
                ) : (
                  <OrgTreeNode node={orgTree} onSelect={handleSelectOrg} />
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No org hierarchy available.
                </p>
              </div>
            )}

            {/* Org detail */}
            {selectedOrgId && (
              <div className="mt-4 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                {orgDetailLoading ? (
                  <SkeletonCard />
                ) : orgDetail ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-950 dark:text-white">
                        {orgDetail.name ?? selectedOrgId}
                      </span>
                      <Button
                        variant="secondary"
                        onClick={() => handleDeactivateOrg(selectedOrgId)}
                      >
                        Deactivate
                      </Button>
                    </div>
                    <pre className="mt-2 max-h-48 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
                      {JSON.stringify(orgDetail, null, 2)}
                    </pre>
                  </>
                ) : (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Could not load org detail.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* ---- Org Lifecycle ---- */}
          <section id="org-lifecycle" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Lifecycle Events
            </h2>

            {lifecycle && lifecycle.length > 0 ? (
              <div className="mt-4 space-y-2">
                {lifecycle.map((evt, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 border-l-2 border-orange-500 pl-3"
                  >
                    <span className="text-sm text-zinc-950 dark:text-white">
                      {evt.event ?? evt.type ?? evt.action ?? `Event ${idx + 1}`}
                    </span>
                    {evt.timestamp && (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        {new Date(evt.timestamp).toLocaleString()}
                      </span>
                    )}
                    {evt.actor && (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        by {evt.actor}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {selectedOrgId
                    ? 'No lifecycle events for this org.'
                    : 'Select an org from the tree above to view lifecycle events.'}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
