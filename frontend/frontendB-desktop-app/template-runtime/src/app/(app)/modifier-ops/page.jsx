'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Heading, Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Input } from '@/components/input'
import { Textarea } from '@/components/textarea'
import { Field, Label } from '@/components/fieldset'
import { Link } from '@/components/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, postJson, patchJson, deleteJson, invalidateCache } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'
import { SkeletonRows } from '@/components/skeleton'

export default function ModifierOpsGovernancePage() {
  const [bindings, setBindings] = useState(null)
  const [orgHierarchy, setOrgHierarchy] = useState(null)
  const [rateLimits, setRateLimits] = useState(null)
  const [tenantScope, setTenantScope] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  // Add Binding Dialog
  const [showAddBinding, setShowAddBinding] = useState(false)
  const [bindingPayload, setBindingPayload] = useState('')
  const [bindingLoading, setBindingLoading] = useState(false)

  // Add Org Dialog
  const [showAddOrg, setShowAddOrg] = useState(false)
  const [orgPayload, setOrgPayload] = useState('')
  const [orgLoading, setOrgLoading] = useState(false)

  // Edit Binding Dialog
  const [showEditBinding, setShowEditBinding] = useState(false)
  const [editBindingId, setEditBindingId] = useState('')
  const [editBindingPayload, setEditBindingPayload] = useState('')
  const [editBindingLoading, setEditBindingLoading] = useState(false)

  // Edit Org Dialog
  const [showEditOrg, setShowEditOrg] = useState(false)
  const [editOrgId, setEditOrgId] = useState('')
  const [editOrgPayload, setEditOrgPayload] = useState('')
  const [editOrgLoading, setEditOrgLoading] = useState(false)

  // Rate limit form
  const [rlPayload, setRlPayload] = useState('')
  const [rlLoading, setRlLoading] = useState(false)

  function fetchAll() {
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const [bindingsData, orgData, rlData, scopeData] = await Promise.all([
          loadJson('/api/openclaw/modifier/ops/tenant-bindings').catch(() => null),
          loadJson('/api/openclaw/modifier/ops/org').catch(() => null),
          loadJson('/api/openclaw/modifier/ops/rate-limit').catch(() => null),
          loadJson('/api/openclaw/modifier/ops/tenant-scope').catch(() => null),
        ])
        if (cancelled) return
        setBindings(Array.isArray(bindingsData?.bindings) ? bindingsData.bindings : Array.isArray(bindingsData) ? bindingsData : [])
        setOrgHierarchy(Array.isArray(orgData?.nodes) ? orgData.nodes : Array.isArray(orgData?.items) ? orgData.items : Array.isArray(orgData) ? orgData : [])
        setRateLimits(rlData)
        setTenantScope(scopeData)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }

  useEffect(() => {
    return fetchAll()
  }, [])

  async function handleAddBinding() {
    setBindingLoading(true)
    try {
      let body = {}
      if (bindingPayload.trim()) { try { body = JSON.parse(bindingPayload) } catch { body = { raw: bindingPayload } } }
      const res = await postJson('/api/openclaw/modifier/ops/tenant-bindings', body)
      if (res.ok) { invalidateCache('/api/openclaw/modifier/ops'); setMessage('Binding added.'); setMessageType('success'); setShowAddBinding(false); fetchAll() }
      else { setMessage('Failed to add binding.'); setMessageType('error') }
    } catch { setMessage('Failed to add binding.'); setMessageType('error') }
    finally { setBindingLoading(false) }
  }

  async function handleRemoveBinding(bindingId) {
    try {
      await deleteJson(`/api/openclaw/modifier/ops/tenant-bindings/${bindingId}`)
      invalidateCache('/api/openclaw/modifier/ops')
      setMessage('Binding removed.'); setMessageType('success')
      fetchAll()
    } catch { setMessage('Failed to remove binding.'); setMessageType('error') }
  }

  async function handleEditBinding() {
    setEditBindingLoading(true)
    try {
      let body = {}
      if (editBindingPayload.trim()) { try { body = JSON.parse(editBindingPayload) } catch { body = { raw: editBindingPayload } } }
      const res = await patchJson(`/api/openclaw/modifier/ops/tenant-bindings/${editBindingId}`, body)
      if (res.ok) { invalidateCache('/api/openclaw/modifier/ops'); setMessage('Binding updated.'); setMessageType('success'); setShowEditBinding(false); fetchAll() }
      else { setMessage('Failed to update binding.'); setMessageType('error') }
    } catch { setMessage('Failed to update binding.'); setMessageType('error') }
    finally { setEditBindingLoading(false) }
  }

  async function handleAddOrg() {
    setOrgLoading(true)
    try {
      let body = {}
      if (orgPayload.trim()) { try { body = JSON.parse(orgPayload) } catch { body = { raw: orgPayload } } }
      const res = await postJson('/api/openclaw/modifier/ops/org', body)
      if (res.ok) { invalidateCache('/api/openclaw/modifier/ops'); setMessage('Org node added.'); setMessageType('success'); setShowAddOrg(false); fetchAll() }
      else { setMessage('Failed to add org node.'); setMessageType('error') }
    } catch { setMessage('Failed to add org node.'); setMessageType('error') }
    finally { setOrgLoading(false) }
  }

  async function handleDeactivateOrg(nodeId) {
    try {
      const res = await postJson(`/api/openclaw/modifier/ops/org/${nodeId}/deactivate`, {})
      if (res.ok) { invalidateCache('/api/openclaw/modifier/ops'); setMessage('Org node deactivated.'); setMessageType('success'); fetchAll() }
      else { setMessage('Failed to deactivate.'); setMessageType('error') }
    } catch { setMessage('Failed to deactivate.'); setMessageType('error') }
  }

  async function handleEditOrg() {
    setEditOrgLoading(true)
    try {
      let body = {}
      if (editOrgPayload.trim()) { try { body = JSON.parse(editOrgPayload) } catch { body = { raw: editOrgPayload } } }
      const res = await patchJson(`/api/openclaw/modifier/ops/org/${editOrgId}`, body)
      if (res.ok) { invalidateCache('/api/openclaw/modifier/ops'); setMessage('Org node updated.'); setMessageType('success'); setShowEditOrg(false); fetchAll() }
      else { setMessage('Failed to update org node.'); setMessageType('error') }
    } catch { setMessage('Failed to update org node.'); setMessageType('error') }
    finally { setEditOrgLoading(false) }
  }

  async function handleDeleteOrg(nodeId) {
    try {
      await deleteJson(`/api/openclaw/modifier/ops/org/${nodeId}`)
      invalidateCache('/api/openclaw/modifier/ops')
      setMessage('Org node deleted.'); setMessageType('success')
      fetchAll()
    } catch { setMessage('Failed to delete org node.'); setMessageType('error') }
  }

  async function handleRateLimit() {
    setRlLoading(true)
    try {
      let body = {}
      if (rlPayload.trim()) { try { body = JSON.parse(rlPayload) } catch { body = { raw: rlPayload } } }
      const res = await postJson('/api/openclaw/modifier/ops/rate-limit', body)
      if (res.ok) { invalidateCache('/api/openclaw/modifier/ops'); setMessage('Rate limit updated.'); setMessageType('success'); fetchAll() }
      else { setMessage('Failed to update rate limit.'); setMessageType('error') }
    } catch { setMessage('Failed to update rate limit.'); setMessageType('error') }
    finally { setRlLoading(false) }
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Modifier Operations</Heading>
        <Button className="-my-0.5" onClick={() => fetchAll()}>Refresh</Button>
      </div>

      {/* Sub-nav */}
      <div className="mt-4 flex gap-4 text-sm font-medium">
        <span className="text-zinc-950 dark:text-white">Governance</span>
        <Link href="/modifier-ops/policy" className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">Policy & Escalation</Link>
        <Link href="/modifier-ops/compliance" className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">Compliance & Alerts</Link>
      </div>

      {message && (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${messageType === 'success' ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'}`}>
          {message}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
        </div>
      )}

      {loading && <SkeletonRows />}

      {/* Tenant Scope */}
      {!loading && tenantScope && (
        <>
          <Divider className="my-6" />
          <Subheading>Tenant Scope</Subheading>
          <pre className="mt-2 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-800">{JSON.stringify(tenantScope, null, 2)}</pre>
        </>
      )}

      {/* Tenant Bindings */}
      {!loading && (
        <>
          <Divider className="my-6" />
          <div className="flex items-center justify-between">
            <Subheading>Tenant Bindings</Subheading>
            <Button onClick={() => { setShowAddBinding(true); setBindingPayload('') }}>Add Binding</Button>
          </div>
          {bindings && bindings.length === 0 && (
            <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No tenant bindings</p>
            </div>
          )}
          {bindings && bindings.length > 0 && (
            <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
              <TableHead>
                <TableRow>
                  <TableHeader>Binding ID</TableHeader>
                  <TableHeader>Tenant</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader className="text-right">Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {bindings.map((b, idx) => {
                  const id = b.bindingId || b.id || `binding-${idx}`
                  return (
                    <TableRow key={id}>
                      <TableCell className="font-mono text-xs">{typeof id === 'string' ? id.substring(0, 12) : String(id)}</TableCell>
                      <TableCell>{b.tenantId || b.tenant || '--'}</TableCell>
                      <TableCell><Badge color={statusColor(b.status)}>{b.status || 'active'}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button outline onClick={() => { setEditBindingId(id); setEditBindingPayload(JSON.stringify(b, null, 2)); setShowEditBinding(true) }}>Edit</Button>
                          <Button color="red" onClick={() => handleRemoveBinding(id)}>Remove</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}

      {/* Org Hierarchy */}
      {!loading && (
        <>
          <Divider className="my-6" />
          <div className="flex items-center justify-between">
            <Subheading>Org Hierarchy</Subheading>
            <Button onClick={() => { setShowAddOrg(true); setOrgPayload('') }}>Add Node</Button>
          </div>
          {orgHierarchy && orgHierarchy.length === 0 && (
            <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No org nodes</p>
            </div>
          )}
          {orgHierarchy && orgHierarchy.length > 0 && (
            <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
              <TableHead>
                <TableRow>
                  <TableHeader>Node</TableHeader>
                  <TableHeader>Parent</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader className="text-right">Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {orgHierarchy.map((node, idx) => {
                  const nodeId = node.nodeId || node.id || `node-${idx}`
                  return (
                    <TableRow key={nodeId}>
                      <TableCell className="font-medium">{node.name || nodeId}</TableCell>
                      <TableCell>{node.parentId || node.parent || '--'}</TableCell>
                      <TableCell><Badge color={statusColor(node.status)}>{node.status || 'active'}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button outline onClick={() => { setEditOrgId(nodeId); setEditOrgPayload(JSON.stringify(node, null, 2)); setShowEditOrg(true) }}>Edit</Button>
                          <Button color="red" onClick={() => handleDeactivateOrg(nodeId)}>Deactivate</Button>
                          <Button color="red" outline onClick={() => handleDeleteOrg(nodeId)}>Delete</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}

      {/* Rate Limits */}
      {!loading && (
        <>
          <Divider className="my-6" />
          <Subheading>Rate Limits</Subheading>
          {rateLimits && (
            <pre className="mt-2 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-800">{JSON.stringify(rateLimits, null, 2)}</pre>
          )}
          <div className="mt-4 space-y-4">
            <Field>
              <Label>Rate Limit Config (JSON)</Label>
              <Textarea rows={3} value={rlPayload} onChange={(e) => setRlPayload(e.target.value)} placeholder='{"requests": 100, "window": "1m"}' />
            </Field>
            <Button disabled={rlLoading} onClick={handleRateLimit}>{rlLoading ? 'Updating...' : 'Update Rate Limit'}</Button>
          </div>
        </>
      )}

      {/* Add Binding Dialog */}
      <Dialog open={showAddBinding} onClose={() => setShowAddBinding(false)} size="sm">
        <DialogTitle>Add Tenant Binding</DialogTitle>
        <DialogDescription>Create a new tenant binding.</DialogDescription>
        <DialogBody>
          <Field><Label>Binding Config (JSON)</Label><Textarea rows={4} value={bindingPayload} onChange={(e) => setBindingPayload(e.target.value)} placeholder='{"tenantId": "...", "modifier": "..."}' /></Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowAddBinding(false)}>Cancel</Button>
          <Button disabled={bindingLoading} onClick={handleAddBinding}>{bindingLoading ? 'Adding...' : 'Add'}</Button>
        </DialogActions>
      </Dialog>

      {/* Add Org Dialog */}
      <Dialog open={showAddOrg} onClose={() => setShowAddOrg(false)} size="sm">
        <DialogTitle>Add Org Node</DialogTitle>
        <DialogDescription>Add a new node to the org hierarchy.</DialogDescription>
        <DialogBody>
          <Field><Label>Node Config (JSON)</Label><Textarea rows={4} value={orgPayload} onChange={(e) => setOrgPayload(e.target.value)} placeholder='{"name": "...", "parentId": "..."}' /></Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowAddOrg(false)}>Cancel</Button>
          <Button disabled={orgLoading} onClick={handleAddOrg}>{orgLoading ? 'Adding...' : 'Add'}</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Binding Dialog */}
      <Dialog open={showEditBinding} onClose={() => setShowEditBinding(false)} size="sm">
        <DialogTitle>Edit Tenant Binding</DialogTitle>
        <DialogDescription>Update the tenant binding configuration.</DialogDescription>
        <DialogBody>
          <Field><Label>Binding Config (JSON)</Label><Textarea rows={4} value={editBindingPayload} onChange={(e) => setEditBindingPayload(e.target.value)} /></Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowEditBinding(false)}>Cancel</Button>
          <Button disabled={editBindingLoading} onClick={handleEditBinding}>{editBindingLoading ? 'Saving...' : 'Save'}</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Org Dialog */}
      <Dialog open={showEditOrg} onClose={() => setShowEditOrg(false)} size="sm">
        <DialogTitle>Edit Org Node</DialogTitle>
        <DialogDescription>Update the org node configuration.</DialogDescription>
        <DialogBody>
          <Field><Label>Node Config (JSON)</Label><Textarea rows={4} value={editOrgPayload} onChange={(e) => setEditOrgPayload(e.target.value)} /></Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowEditOrg(false)}>Cancel</Button>
          <Button disabled={editOrgLoading} onClick={handleEditOrg}>{editOrgLoading ? 'Saving...' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
