'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadJson, postJson, deleteJson } from '@/lib/api'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'
import { SkeletonCard, SkeletonList } from '@/components/Skeleton'

function OrgTreeNode({ node, depth = 0, onSelect }) {
  const children = node.children ?? node.subOrgs ?? []
  return (
    <div style={{ marginLeft: depth * 16 }}>
      <button type="button" onClick={() => onSelect(node.id ?? node.orgId)} className="w-full rounded-lg px-3 py-1.5 text-left text-sm transition hover:bg-zinc-100 dark:hover:bg-zinc-800">
        <span className="font-medium text-zinc-950 dark:text-white">{node.name ?? node.id ?? node.orgId}</span>
        {node.status && <Tag color={node.status === 'active' ? 'orange' : 'zinc'} variant="small">{node.status.toUpperCase()}</Tag>}
      </button>
      {children.map((child, idx) => (
        <OrgTreeNode key={child.id ?? child.orgId ?? idx} node={child} depth={depth + 1} onSelect={onSelect} />
      ))}
    </div>
  )
}

export default function OrgHierarchy() {
  const [orgTree, setOrgTree] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showOrgForm, setShowOrgForm] = useState(false)
  const [orgInput, setOrgInput] = useState('')
  const [orgMsg, setOrgMsg] = useState(null)
  const [selectedOrgId, setSelectedOrgId] = useState(null)
  const [orgDetail, setOrgDetail] = useState(null)
  const [orgDetailLoading, setOrgDetailLoading] = useState(false)
  const [lifecycle, setLifecycle] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try { setOrgTree(await loadJson('/api/operations/orchestrations/org/tree')) }
    catch { /* non-critical */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!orgMsg) return
    const t = setTimeout(() => setOrgMsg(null), 5000)
    return () => clearTimeout(t)
  }, [orgMsg])

  async function handleSelectOrg(orgId) {
    setSelectedOrgId(orgId)
    setOrgDetailLoading(true)
    try {
      const [d, l] = await Promise.allSettled([
        loadJson(`/api/operations/orchestrations/org/${orgId}`),
        loadJson(`/api/operations/orchestrations/org/${orgId}/lifecycle`),
      ])
      if (d.status === 'fulfilled') setOrgDetail(d.value)
      if (l.status === 'fulfilled') {
        const data = l.value
        setLifecycle(Array.isArray(data) ? data : data.events ?? data.lifecycle ?? [])
      }
    } catch { /* non-critical */ }
    finally { setOrgDetailLoading(false) }
  }

  async function handleCreateOrg() {
    setOrgMsg(null)
    try {
      const body = orgInput.trim() ? JSON.parse(orgInput) : {}
      await postJson('/api/operations/orchestrations/org', body)
      setOrgMsg('Org created/updated.')
      setOrgInput('')
      setShowOrgForm(false)
      fetchData()
    } catch (err) { setOrgMsg(`Failed: ${err.message}`) }
  }

  async function handleDeactivateOrg(orgId) {
    try {
      await deleteJson(`/api/operations/orchestrations/org/${orgId}`)
      setOrgMsg(`Org ${orgId} deactivated.`)
      setSelectedOrgId(null)
      setOrgDetail(null)
      fetchData()
    } catch (err) { setOrgMsg(`Deactivate failed: ${err.message}`) }
  }

  return (
    <>
      <section id="org-tree" className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Organization Hierarchy</h2>
          <Button variant="secondary" onClick={() => setShowOrgForm(!showOrgForm)}>Create Org</Button>
        </div>

        {showOrgForm && (
          <div className="mt-3 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
            <label className="block text-sm font-medium text-zinc-950 dark:text-white">Org Data (JSON)</label>
            <textarea className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white" rows={3} value={orgInput} onChange={(e) => setOrgInput(e.target.value)} placeholder='{"name": "...", "parentId": "..."}' />
            <div className="mt-3 flex gap-2">
              <Button variant="filled" onClick={handleCreateOrg}>Create / Update</Button>
              <Button variant="secondary" onClick={() => setShowOrgForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {orgMsg && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{orgMsg}</p>}

        {loading && !orgTree ? (
          <div className="mt-4"><SkeletonList /></div>
        ) : orgTree ? (
          <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            {Array.isArray(orgTree) ? orgTree.map((node, idx) => (
              <OrgTreeNode key={node.id ?? node.orgId ?? idx} node={node} onSelect={handleSelectOrg} />
            )) : orgTree.root ? (
              <OrgTreeNode node={orgTree.root} onSelect={handleSelectOrg} />
            ) : (
              <OrgTreeNode node={orgTree} onSelect={handleSelectOrg} />
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No org hierarchy available.</p>
          </div>
        )}

        {selectedOrgId && (
          <div className="mt-4 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
            {orgDetailLoading ? <SkeletonCard /> : orgDetail ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-950 dark:text-white">{orgDetail.name ?? selectedOrgId}</span>
                  <Button variant="secondary" onClick={() => handleDeactivateOrg(selectedOrgId)}>Deactivate</Button>
                </div>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(orgDetail, null, 2)}</pre>
              </>
            ) : <p className="text-sm text-zinc-500 dark:text-zinc-400">Could not load org detail.</p>}
          </div>
        )}
      </section>

      <section id="org-lifecycle" className="mt-10">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Lifecycle Events</h2>
        {lifecycle && lifecycle.length > 0 ? (
          <div className="mt-4 space-y-2">
            {lifecycle.map((evt, idx) => (
              <div key={idx} className="flex items-center gap-2 border-l-2 border-orange-500 pl-3">
                <span className="text-sm text-zinc-950 dark:text-white">{evt.event ?? evt.type ?? evt.action ?? `Event ${idx + 1}`}</span>
                {evt.timestamp && <span className="text-xs text-zinc-400 dark:text-zinc-500">{new Date(evt.timestamp).toLocaleString()}</span>}
                {evt.actor && <span className="text-xs text-zinc-400 dark:text-zinc-500">by {evt.actor}</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{selectedOrgId ? 'No lifecycle events for this org.' : 'Select an org from the tree above to view lifecycle events.'}</p>
          </div>
        )}
      </section>
    </>
  )
}
