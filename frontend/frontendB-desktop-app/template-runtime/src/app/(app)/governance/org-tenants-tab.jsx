'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogBody, DialogActions } from '@/components/dialog'
import { Divider } from '@/components/divider'
import { Input } from '@/components/input'
import { Subheading } from '@/components/heading'
import { Field, Label } from '@/components/fieldset'
import { DescriptionList, DescriptionTerm, DescriptionDetails } from '@/components/description-list'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { OrgTree } from '@/components/org-tree'
import { loadJson, postJson, deleteJson, invalidateCache, getCached } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'
import { SkeletonRows } from '@/components/skeleton'

export default function OrgTenantsTab() {
  const _cb = getCached('/api/operations/orchestrations/tenant-bindings')
  const _corg = getCached('/api/operations/orchestrations/org/tree')
  const _crl = getCached('/api/operations/orchestrations/rate-limit')
  const _hasCached = !!(_cb || _corg || _crl)

  const [bindings, setBindings] = useState(() => {
    if (!_cb) return []
    return Array.isArray(_cb) ? _cb : Array.isArray(_cb?.bindings) ? _cb.bindings : []
  })
  const [orgHierarchy, setOrgHierarchy] = useState(() => {
    if (!_corg) return []
    return Array.isArray(_corg) ? _corg : Array.isArray(_corg?.nodes) ? _corg.nodes : _corg?.tree ? [_corg.tree] : []
  })
  const [rateLimits, setRateLimits] = useState(_crl || null)
  const [loading, setLoading] = useState(!_hasCached)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Add/Edit Binding dialog
  const [showBindingDialog, setShowBindingDialog] = useState(false)
  const [editingBinding, setEditingBinding] = useState(null)
  const [bindingTenantId, setBindingTenantId] = useState('')
  const [bindingScope, setBindingScope] = useState('')
  const [bindingSaving, setBindingSaving] = useState(false)

  // Rate Limit edit dialog
  const [showRlDialog, setShowRlDialog] = useState(false)
  const [rlValue, setRlValue] = useState('')
  const [rlSaving, setRlSaving] = useState(false)

  async function fetchAll() {
    setLoading(true)
    try {
      const [bindingsData, orgData, rlData] = await Promise.all([
        loadJson('/api/operations/orchestrations/tenant-bindings'),
        loadJson('/api/operations/orchestrations/org/tree'),
        loadJson('/api/operations/orchestrations/rate-limit'),
      ])
      setBindings(Array.isArray(bindingsData) ? bindingsData : Array.isArray(bindingsData?.bindings) ? bindingsData.bindings : [])
      setOrgHierarchy(Array.isArray(orgData) ? orgData : Array.isArray(orgData?.nodes) ? orgData.nodes : orgData?.tree ? [orgData.tree] : [])
      setRateLimits(rlData)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  function openAddBinding() {
    setEditingBinding(null)
    setBindingTenantId('')
    setBindingScope('')
    setShowBindingDialog(true)
  }

  function openEditBinding(binding) {
    setEditingBinding(binding)
    setBindingTenantId(binding.tenantId || binding.tenant || '')
    setBindingScope(binding.scope || '')
    setShowBindingDialog(true)
  }

  async function handleSaveBinding() {
    setBindingSaving(true)
    try {
      const body = { tenantId: bindingTenantId, scope: bindingScope }
      if (editingBinding) {
        // Backend uses DELETE + POST for updates (no PATCH on individual bindings)
        await deleteJson('/api/operations/orchestrations/tenant-bindings')
        await postJson('/api/operations/orchestrations/tenant-bindings', body)
      } else {
        await postJson('/api/operations/orchestrations/tenant-bindings', body)
      }
      setShowBindingDialog(false)
      invalidateCache('/api/operations/orchestrations/tenant-bindings')
      fetchAll()
      setMessage(editingBinding ? 'Binding updated' : 'Binding added')
    } catch {
      setMessage('Failed to save binding')
    } finally {
      setBindingSaving(false)
    }
  }

  async function handleRemoveBinding(binding) {
    try {
      await deleteJson('/api/operations/orchestrations/tenant-bindings')
      invalidateCache('/api/operations/orchestrations/tenant-bindings')
      fetchAll()
      setMessage('Binding removed')
    } catch {
      setMessage('Failed to remove binding')
    }
  }

  async function handleOrgSave({ mode, parentId, nodeId, name, description }) {
    try {
      // Backend only supports POST (create) and DELETE — no PATCH for org nodes
      await postJson('/api/operations/orchestrations/org', { parentId, name, description })
      invalidateCache('/api/operations/orchestrations/org/tree')
      fetchAll()
      setMessage(mode === 'add' ? 'Node added' : 'Node updated')
    } catch {
      setMessage('Failed to save org node')
    }
  }

  async function handleDeactivateOrg(node) {
    try {
      await deleteJson(`/api/operations/orchestrations/org/${node.id}`)
      invalidateCache('/api/operations/orchestrations/org/tree')
      fetchAll()
      setMessage('Node deactivated')
    } catch {
      setMessage('Failed to deactivate node')
    }
  }

  async function handleSaveRateLimits() {
    setRlSaving(true)
    try {
      let body
      try { body = JSON.parse(rlValue) } catch { body = { value: rlValue } }
      await postJson('/api/operations/orchestrations/rate-limit/config', body)
      invalidateCache('/api/operations/orchestrations/rate-limit')
      setShowRlDialog(false)
      fetchAll()
      setMessage('Rate limits updated')
    } catch {
      setMessage('Failed to update rate limits')
    } finally {
      setRlSaving(false)
    }
  }

  if (loading) return <SkeletonRows />

  return (
    <div className="mt-4 space-y-8">
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{error}</p>
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 dark:border-sky-900 dark:bg-sky-950/40">
          <p className="text-sm text-sky-800 dark:text-sky-300">{message}</p>
        </div>
      )}

      {/* Org Hierarchy */}
      <div>
        <Subheading>Organization Hierarchy</Subheading>
        <div className="mt-3">
          <OrgTree
            nodes={orgHierarchy}
            onDeactivate={handleDeactivateOrg}
            onSave={handleOrgSave}
          />
        </div>
      </div>

      <Divider />

      {/* Tenant Bindings */}
      <div>
        <div className="flex items-center justify-between">
          <Subheading>Tenant Bindings</Subheading>
          <Button onClick={openAddBinding}>Add Binding</Button>
        </div>
        {bindings.length > 0 ? (
          <Table className="mt-3 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Tenant ID</TableHeader>
                <TableHeader>Scope</TableHeader>
                <TableHeader>Created</TableHeader>
                <TableHeader className="text-right">Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {bindings.map((b, idx) => (
                <TableRow key={b.id || idx}>
                  <TableCell className="font-mono text-xs">{b.tenantId || b.tenant || '--'}</TableCell>
                  <TableCell>{b.scope || '--'}</TableCell>
                  <TableCell className="text-zinc-500">{formatDate(b.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button plain onClick={() => openEditBinding(b)}>Edit</Button>
                      <Button plain className="!text-red-500" onClick={() => handleRemoveBinding(b)}>Remove</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No tenant bindings configured.</p>
        )}
      </div>

      <Divider />

      {/* Rate Limits */}
      <div>
        <div className="flex items-center justify-between">
          <Subheading>Rate Limits</Subheading>
          <Button onClick={() => { setRlValue(JSON.stringify(rateLimits || {}, null, 2)); setShowRlDialog(true) }}>
            Edit
          </Button>
        </div>
        {rateLimits && typeof rateLimits === 'object' ? (
          <DescriptionList className="mt-3">
            {Object.entries(rateLimits).map(([key, value]) => (
              <div key={key}>
                <DescriptionTerm>{key}</DescriptionTerm>
                <DescriptionDetails>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</DescriptionDetails>
              </div>
            ))}
          </DescriptionList>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No rate limits configured.</p>
        )}
      </div>

      {/* Binding Dialog */}
      <Dialog open={showBindingDialog} onClose={() => setShowBindingDialog(false)} size="sm">
        <DialogTitle>{editingBinding ? 'Edit Binding' : 'Add Binding'}</DialogTitle>
        <DialogBody>
          <div className="space-y-4">
            <Field>
              <Label>Tenant ID</Label>
              <Input value={bindingTenantId} onChange={(e) => setBindingTenantId(e.target.value)} placeholder="tenant-id" />
            </Field>
            <Field>
              <Label>Scope</Label>
              <Input value={bindingScope} onChange={(e) => setBindingScope(e.target.value)} placeholder="scope" />
            </Field>
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowBindingDialog(false)}>Cancel</Button>
          <Button disabled={bindingSaving || !bindingTenantId.trim()} onClick={handleSaveBinding}>
            {bindingSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rate Limits Dialog */}
      <Dialog open={showRlDialog} onClose={() => setShowRlDialog(false)} size="sm">
        <DialogTitle>Edit Rate Limits</DialogTitle>
        <DialogBody>
          <Field>
            <Label>Rate Limits (JSON)</Label>
            <Input value={rlValue} onChange={(e) => setRlValue(e.target.value)} />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowRlDialog(false)}>Cancel</Button>
          <Button disabled={rlSaving} onClick={handleSaveRateLimits}>
            {rlSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
