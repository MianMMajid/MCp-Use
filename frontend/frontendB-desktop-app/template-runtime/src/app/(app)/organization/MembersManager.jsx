'use client'

import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Divider } from '@/components/divider'
import { Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Text } from '@/components/text'
import { Field, Label } from '@/components/fieldset'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/table'
import { SkeletonList } from '@/components/skeleton'
import { loadJson, postJson, deleteJson, invalidateCache } from '@/lib/api'

export default function MembersManager() {
  const [selectedOrgId, setSelectedOrgId] = useState(null)
  const [selectedOrgName, setSelectedOrgName] = useState('')
  const [ownerUserId, setOwnerUserId] = useState(null)
  const [members, setMembers] = useState([])
  const [roles, setRoles] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

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

  // Listen for org selection from OrgManager
  useEffect(() => {
    function handleOrgSelected(e) {
      const orgId = e.detail?.orgId
      if (orgId && orgId !== selectedOrgId) {
        setSelectedOrgId(orgId)
      }
    }
    window.addEventListener('org-selected', handleOrgSelected)
    return () => window.removeEventListener('org-selected', handleOrgSelected)
  }, [selectedOrgId])

  // Fetch initial org list to determine starting selection and org metadata
  useEffect(() => {
    async function init() {
      try {
        const data = await loadJson('/api/org')
        const items = Array.isArray(data?.items) ? data.items : []
        if (items.length > 0) {
          setSelectedOrgId((prev) => prev ?? items[0].orgId)
          const org = items[0]
          setSelectedOrgName(org.name || '')
          setOwnerUserId(org.ownerUserId || null)
        }
      } catch {
        // OrgManager handles the org-level error display
      }
    }
    init()
  }, [])

  // Keep org metadata in sync when selectedOrgId changes
  useEffect(() => {
    if (!selectedOrgId) return
    async function syncOrgMeta() {
      try {
        const data = await loadJson('/api/org')
        const items = Array.isArray(data?.items) ? data.items : []
        const org = items.find((o) => o.orgId === selectedOrgId)
        if (org) {
          setSelectedOrgName(org.name || '')
          setOwnerUserId(org.ownerUserId || null)
        }
      } catch {
        // ignore
      }
    }
    syncOrgMeta()
  }, [selectedOrgId])

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
    } catch {
      // errors are non-critical, silently degrade
    } finally {
      setMembersLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedOrgId) {
      fetchMembers(selectedOrgId)
    }
  }, [selectedOrgId, fetchMembers])

  async function handleInviteMember() {
    if (!inviteEmail.trim() || !selectedOrgId) return
    setInviteLoading(true)
    try {
      const body = { email: inviteEmail.trim() }
      if (inviteRoleId) body.roleId = inviteRoleId
      const res = await postJson(`/api/org/${selectedOrgId}/invites`, body)
      if (res.ok) {
        invalidateCache('/api/org')
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
      invalidateCache('/api/org')
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
        invalidateCache('/api/org')
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
        invalidateCache('/api/org')
        setMessage('Invitation accepted successfully.')
        setMessageType('success')
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
    return ownerUserId === userId
  }

  if (!selectedOrgId) return null

  return (
    <>
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
                      {invite.createdAt && ` \u00b7 Sent ${new Date(invite.createdAt).toLocaleDateString()}`}
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
          <div className="overflow-x-auto">
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
          </div>
        )}
      </div>

      {/* Invite Member Dialog */}
      <Dialog open={showInviteDialog} onClose={() => setShowInviteDialog(false)} size="sm">
        <DialogTitle>Invite Member</DialogTitle>
        <DialogDescription>
          Send an invitation to join {selectedOrgName || 'the organization'}.
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
    </>
  )
}
