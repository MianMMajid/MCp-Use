'use client'

import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Divider } from '@/components/divider'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/table'
import { Text } from '@/components/text'
import { Field, Label } from '@/components/fieldset'
import { loadJson, postJson, patchJson, deleteJson } from '@/lib/api'

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
    <div className="animate-pulse space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-4 w-20 rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="ml-auto h-4 w-16 rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
      ))}
    </div>
  )
}

export default function OrganizationPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')
  const [orgs, setOrgs] = useState([])
  const [selectedOrgId, setSelectedOrgId] = useState(null)
  const [members, setMembers] = useState([])
  const [roles, setRoles] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)

  // Create org dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  // Rename org
  const [editingName, setEditingName] = useState(false)
  const [orgNameDraft, setOrgNameDraft] = useState('')
  const [renameLoading, setRenameLoading] = useState(false)

  // Invite member dialog
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRoleId, setInviteRoleId] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)

  // Remove member dialog
  const [removeMemberDialog, setRemoveMemberDialog] = useState(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  // Pending invites
  const [pendingInvites, setPendingInvites] = useState([])
  const [acceptingInvite, setAcceptingInvite] = useState(null)

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

  const fetchMembers = useCallback(async (orgId) => {
    if (!orgId) return
    setMembersLoading(true)
    try {
      const [membersData, rolesData, invitesData] = await Promise.all([
        loadJson(`/api/org/${orgId}/members`).catch(() => ({ items: [] })),
        loadJson(`/api/org/${orgId}/roles`).catch(() => ({ items: [] })),
        loadJson(`/api/org/${orgId}/invites`).catch(() => ({ items: [] })),
      ])
      setMembers(Array.isArray(membersData?.items) ? membersData.items : [])
      setRoles(Array.isArray(rolesData?.items) ? rolesData.items : [])
      const invites = Array.isArray(invitesData?.items) ? invitesData.items : []
      setPendingInvites(invites.filter((i) => i.status === 'pending'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setMembersLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrgs()
  }, [fetchOrgs])

  useEffect(() => {
    if (selectedOrgId) {
      fetchMembers(selectedOrgId)
    }
  }, [selectedOrgId, fetchMembers])

  async function handleCreateOrg() {
    if (!newOrgName.trim()) return
    setCreateLoading(true)
    try {
      const res = await postJson('/api/org', { name: newOrgName.trim() })
      if (res.ok) {
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

  async function handleInviteMember() {
    if (!inviteEmail.trim() || !selectedOrgId) return
    setInviteLoading(true)
    try {
      const body = { email: inviteEmail.trim() }
      if (inviteRoleId) body.roleId = inviteRoleId
      const res = await postJson(`/api/org/${selectedOrgId}/invites`, body)
      if (res.ok) {
        setMessage('Invitation sent successfully.')
        setMessageType('success')
        setShowInviteDialog(false)
        setInviteEmail('')
        setInviteRoleId('')
        await fetchMembers(selectedOrgId)
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage(data.error || 'Failed to send invitation.')
        setMessageType('error')
      }
    } catch (err) {
      setMessage('Failed to send invitation.')
      setMessageType('error')
    } finally {
      setInviteLoading(false)
    }
  }

  async function handleRemoveMember(userId) {
    if (!selectedOrgId) return
    setRemoveLoading(true)
    try {
      await deleteJson(`/api/org/${selectedOrgId}/members/${userId}`)
      setMessage('Member removed successfully.')
      setMessageType('success')
      setRemoveMemberDialog(null)
      await fetchMembers(selectedOrgId)
    } catch (err) {
      setMessage('Failed to remove member.')
      setMessageType('error')
    } finally {
      setRemoveLoading(false)
    }
  }

  async function handleAssignRole(userId, roleId) {
    if (!selectedOrgId) return
    try {
      const res = await postJson(`/api/org/${selectedOrgId}/roles/${roleId}/assign`, { userId })
      if (res.ok) {
        setMessage('Role updated successfully.')
        setMessageType('success')
        await fetchMembers(selectedOrgId)
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage(data.error || 'Failed to assign role.')
        setMessageType('error')
      }
    } catch (err) {
      setMessage('Failed to assign role.')
      setMessageType('error')
    }
  }

  async function handleAcceptInvite(inviteId) {
    setAcceptingInvite(inviteId)
    try {
      const res = await postJson(`/api/org/invites/${inviteId}/accept`, {})
      if (res.ok) {
        setMessage('Invitation accepted successfully.')
        setMessageType('success')
        await fetchOrgs()
        if (selectedOrgId) await fetchMembers(selectedOrgId)
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage(data.error || 'Failed to accept invitation.')
        setMessageType('error')
      }
    } catch {
      setMessage('Failed to accept invitation.')
      setMessageType('error')
    } finally {
      setAcceptingInvite(null)
    }
  }

  function getRoleLabel(roleId) {
    const role = roles.find((r) => r.roleId === roleId)
    return role?.label || roleId || 'Unknown'
  }

  function isOwner(userId) {
    return selectedOrg?.ownerUserId === userId
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <Heading>Organization</Heading>
        <Text className="mt-2">Manage your organizations, members, and roles.</Text>
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="mt-8">
          <SkeletonList />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <Heading>Organization</Heading>
        <Button color="orange" onClick={() => { setShowCreateDialog(true); setNewOrgName('') }}>
          Create Organization
        </Button>
      </div>
      <Text className="mt-2">Manage your organizations, members, and roles.</Text>

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
            <>
              {/* Org Details */}
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
                      {selectedOrg.membersCount ?? members.length}
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

              {/* Pending Invites Section */}
              {pendingInvites.length > 0 && (
                <div className="mt-8">
                  <Subheading>Pending Invites</Subheading>
                  <Divider className="my-4" soft />
                  <div className="space-y-3">
                    {pendingInvites.map((invite) => {
                      const inviteId = invite.inviteId || invite.id
                      return (
                        <div
                          key={inviteId}
                          className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-700"
                        >
                          <div>
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {invite.email || invite.inviteeEmail || 'Unknown'}
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              <Badge color="orange">pending</Badge>
                              {invite.createdAt && ` · Sent ${new Date(invite.createdAt).toLocaleDateString()}`}
                            </p>
                          </div>
                          <Button
                            color="orange"
                            disabled={acceptingInvite === inviteId}
                            onClick={() => handleAcceptInvite(inviteId)}
                          >
                            {acceptingInvite === inviteId ? 'Accepting...' : 'Accept'}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Members Section */}
              <div className="mt-8">
                <div className="flex items-center justify-between gap-4">
                  <Subheading>Members</Subheading>
                  <Button color="orange" onClick={() => { setShowInviteDialog(true); setInviteEmail(''); setInviteRoleId('') }}>
                    Invite Member
                  </Button>
                </div>

                <Divider className="my-4" soft />

                {membersLoading ? (
                  <SkeletonList />
                ) : members.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-950/10 bg-white p-6 text-center dark:border-white/10 dark:bg-zinc-900">
                    <Text>No members yet. Invite someone to get started.</Text>
                  </div>
                ) : (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeader>User ID</TableHeader>
                        <TableHeader>Role</TableHeader>
                        <TableHeader>Joined</TableHeader>
                        <TableHeader>Actions</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {members.map((member) => (
                        <TableRow key={member.userId}>
                          <TableCell>
                            <span className="text-sm font-medium text-zinc-950 dark:text-white">
                              {member.userId}
                            </span>
                            {isOwner(member.userId) && (
                              <Badge color="amber" className="ml-2">Owner</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge color="blue">{getRoleLabel(member.roleId)}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-zinc-500 dark:text-zinc-400">
                              {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : 'N/A'}
                            </span>
                          </TableCell>
                          <TableCell>
                            {isOwner(member.userId) ? (
                              <span className="text-xs text-zinc-400 dark:text-zinc-500">--</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                {roles.length > 0 && (
                                  <Select
                                    className="max-w-[140px]"
                                    value={member.roleId || ''}
                                    onChange={(e) => handleAssignRole(member.userId, e.target.value)}
                                  >
                                    {roles.map((role) => (
                                      <option key={role.roleId} value={role.roleId}>
                                        {role.label}
                                      </option>
                                    ))}
                                  </Select>
                                )}
                                <Button
                                  color="red"
                                  onClick={() => setRemoveMemberDialog(member)}
                                >
                                  Remove
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
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

      {/* Invite Member Dialog */}
      <Dialog open={showInviteDialog} onClose={() => setShowInviteDialog(false)} size="sm">
        <DialogTitle>Invite Member</DialogTitle>
        <DialogDescription>
          Send an invitation to join {selectedOrg?.name || 'the organization'}.
        </DialogDescription>
        <DialogBody>
          <div className="space-y-4">
            <Field>
              <Label>Email Address</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
              />
            </Field>
            {roles.length > 0 && (
              <Field>
                <Label>Role (optional)</Label>
                <Select value={inviteRoleId} onChange={(e) => setInviteRoleId(e.target.value)}>
                  <option value="">Default role</option>
                  {roles.map((role) => (
                    <option key={role.roleId} value={role.roleId}>
                      {role.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowInviteDialog(false)}>
            Cancel
          </Button>
          <Button
            color="orange"
            disabled={!inviteEmail.trim() || inviteLoading}
            onClick={handleInviteMember}
          >
            {inviteLoading ? 'Sending...' : 'Send Invite'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <Dialog open={removeMemberDialog !== null} onClose={() => setRemoveMemberDialog(null)} size="sm">
        <DialogTitle>Remove Member</DialogTitle>
        <DialogDescription>
          Are you sure you want to remove {removeMemberDialog?.userId} from this organization? This action cannot be undone.
        </DialogDescription>
        <DialogActions>
          <Button plain onClick={() => setRemoveMemberDialog(null)}>
            Cancel
          </Button>
          <Button
            color="red"
            disabled={removeLoading}
            onClick={() => handleRemoveMember(removeMemberDialog?.userId)}
          >
            {removeLoading ? 'Removing...' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
