'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Divider } from '@/components/divider'
import { Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Text } from '@/components/text'
import { Field, Label } from '@/components/fieldset'
import { SkeletonCard } from '@/components/skeleton'
import { loadJson, postJson, patchJson, invalidateCache, getCached } from '@/lib/api'

export default function OrgManager() {
  const _c = getCached('/api/org')
  const _items = _c ? (Array.isArray(_c?.items) ? _c.items : []) : []
  const [loading, setLoading] = useState(!_c)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')
  const [orgs, setOrgs] = useState(_items)
  const [selectedOrgId, setSelectedOrgId] = useState(() => _items.length > 0 ? _items[0].orgId : null)

  // Create org dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  // Rename org
  const [editingName, setEditingName] = useState(false)
  const [orgNameDraft, setOrgNameDraft] = useState('')
  const [renameLoading, setRenameLoading] = useState(false)

  const selectedOrg = orgs.find((o) => o.orgId === selectedOrgId) || null

  const fetchOrgs = useCallback(async () => {
    try {
      const data = await loadJson('/api/org')
      const items = Array.isArray(data?.items) ? data.items : []
      setOrgs(items)
      if (items.length > 0) {
        setSelectedOrgId((prev) => prev ?? items[0].orgId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrgs()
  }, [fetchOrgs])

  // Broadcast selected org changes so MembersManager can react
  useEffect(() => {
    if (selectedOrgId) {
      window.dispatchEvent(new CustomEvent('org-selected', { detail: { orgId: selectedOrgId } }))
    }
  }, [selectedOrgId])

  async function handleCreateOrg() {
    if (!newOrgName.trim()) return
    setCreateLoading(true)
    try {
      const res = await postJson('/api/org', { name: newOrgName.trim() })
      if (res.ok) {
        invalidateCache('/api/org')
        const data = await res.json()
        setMessage('Organization created successfully.')
        setMessageType('success')
        setShowCreateDialog(false)
        setNewOrgName('')
        await fetchOrgs()
        if (data.org?.orgId) {
          setSelectedOrgId(data.org.orgId)
        }
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage(data.error || 'Failed to create organization.')
        setMessageType('error')
      }
    } catch (err) {
      setMessage('Failed to create organization.')
      setMessageType('error')
    } finally {
      setCreateLoading(false)
    }
  }

  async function handleRenameOrg() {
    if (!orgNameDraft.trim() || !selectedOrgId) return
    setRenameLoading(true)
    try {
      const res = await patchJson(`/api/org/${selectedOrgId}`, { name: orgNameDraft.trim() })
      if (res.ok) {
        invalidateCache('/api/org')
        setMessage('Organization renamed successfully.')
        setMessageType('success')
        setEditingName(false)
        await fetchOrgs()
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage(data.error || 'Failed to rename organization.')
        setMessageType('error')
      }
    } catch (err) {
      setMessage('Failed to rename organization.')
      setMessageType('error')
    } finally {
      setRenameLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-4">
        <Subheading>Organizations</Subheading>
        <Button color="orange" onClick={() => { setShowCreateDialog(true); setNewOrgName('') }}>
          Create Organization
        </Button>
      </div>

      {message && (
        <p
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            messageType === 'success'
              ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
          }`}
        >
          {message}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            The gateway may be starting up or temporarily unavailable. Try refreshing the page.
          </p>
        </div>
      )}

      <Divider className="my-6" />

      {orgs.length === 0 && !error ? (
        <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <Subheading>No organizations yet.</Subheading>
          <Text className="mt-2">Create an organization to get started with team collaboration.</Text>
          <div className="mt-4">
            <Button color="orange" onClick={() => { setShowCreateDialog(true); setNewOrgName('') }}>
              Create Organization
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Org Selector */}
          {orgs.length > 1 && (
            <div className="mb-6">
              <Field>
                <Label>Select Organization</Label>
                <Select
                  value={selectedOrgId || ''}
                  onChange={(e) => setSelectedOrgId(e.target.value)}
                >
                  {orgs.map((org) => (
                    <option key={org.orgId} value={org.orgId}>
                      {org.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          {selectedOrg && (
            <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
              <div className="flex items-start justify-between gap-4">
                {editingName ? (
                  <div className="flex flex-1 items-center gap-3">
                    <Input
                      value={orgNameDraft}
                      onChange={(e) => setOrgNameDraft(e.target.value)}
                      className="max-w-xs"
                      placeholder="Organization name"
                    />
                    <Button
                      color="orange"
                      disabled={!orgNameDraft.trim() || renameLoading}
                      onClick={handleRenameOrg}
                    >
                      {renameLoading ? 'Saving...' : 'Save'}
                    </Button>
                    <Button plain onClick={() => setEditingName(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Subheading>{selectedOrg.name}</Subheading>
                    <Button
                      plain
                      onClick={() => {
                        setEditingName(true)
                        setOrgNameDraft(selectedOrg.name)
                      }}
                    >
                      Rename
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-6">
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Members</p>
                  <p className="text-lg font-semibold text-zinc-950 dark:text-zinc-100">
                    {selectedOrg.membersCount ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Created</p>
                  <p className="text-sm text-zinc-950 dark:text-zinc-100">
                    {selectedOrg.createdAt ? new Date(selectedOrg.createdAt).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                {selectedOrg.updatedAt && (
                  <div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Updated</p>
                    <p className="text-sm text-zinc-950 dark:text-zinc-100">
                      {new Date(selectedOrg.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Organization Dialog */}
      <Dialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} size="sm">
        <DialogTitle>Create Organization</DialogTitle>
        <DialogDescription>Enter a name for your new organization.</DialogDescription>
        <DialogBody>
          <Field>
            <Label>Organization Name</Label>
            <Input
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="My Organization"
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowCreateDialog(false)}>
            Cancel
          </Button>
          <Button
            color="orange"
            disabled={!newOrgName.trim() || createLoading}
            onClick={handleCreateOrg}
          >
            {createLoading ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
