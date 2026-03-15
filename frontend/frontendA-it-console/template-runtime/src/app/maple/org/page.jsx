'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Organizations', id: 'org-list' },
  { title: 'Members', id: 'members' },
  { title: 'Invites', id: 'invites' },
  { title: 'Accept invite', id: 'accept-invite' },
  { title: 'Roles', id: 'roles' },
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

async function patchJson(path, body) {
  const res = await fetch(path, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

async function deleteJson(path) {
  const res = await fetch(path, { method: 'DELETE', credentials: 'same-origin', headers: { Accept: 'application/json' } })
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

export default function OrgPage() {
  const [orgs, setOrgs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState('')
  const [actionLoading, setActionLoading] = useState('')
  const [selectedOrg, setSelectedOrg] = useState(null)

  const [members, setMembers] = useState(null)
  const [invites, setInvites] = useState(null)
  const [roles, setRoles] = useState(null)

  // Create org form
  const [newOrgName, setNewOrgName] = useState('')
  // Invite form
  const [inviteEmail, setInviteEmail] = useState('')
  // Update org form
  const [updateName, setUpdateName] = useState('')
  // Role assign
  const [assignUserId, setAssignUserId] = useState('')
  const [assignRoleId, setAssignRoleId] = useState('')
  // Accept invite
  const [acceptInviteId, setAcceptInviteId] = useState('')

  const fetchOrgs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadJson('/api/org')
      setOrgs(Array.isArray(data?.items) ? data.items : Array.isArray(data?.orgs) ? data.orgs : Array.isArray(data) ? data : [])
    } catch (err) { setError(err.message); setOrgs([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchOrgs() }, [fetchOrgs])

  async function refreshOrgDetail(orgId) {
    setSelectedOrg(orgId)
    try {
      const [m, i, r] = await Promise.allSettled([
        loadJson(`/api/org/${encodeURIComponent(orgId)}/members`),
        loadJson(`/api/org/${encodeURIComponent(orgId)}/invites`),
        loadJson(`/api/org/${encodeURIComponent(orgId)}/roles`),
      ])
      setMembers(m.status === 'fulfilled' ? (Array.isArray(m.value?.items) ? m.value.items : Array.isArray(m.value?.members) ? m.value.members : Array.isArray(m.value) ? m.value : []) : [])
      setInvites(i.status === 'fulfilled' ? (Array.isArray(i.value?.items) ? i.value.items : Array.isArray(i.value?.invites) ? i.value.invites : Array.isArray(i.value) ? i.value : []) : [])
      setRoles(r.status === 'fulfilled' ? (Array.isArray(r.value?.items) ? r.value.items : Array.isArray(r.value?.roles) ? r.value.roles : Array.isArray(r.value) ? r.value : []) : [])
    } catch { setMembers([]); setInvites([]); setRoles([]) }
  }

  function selectOrg(orgId) {
    if (selectedOrg === orgId) { setSelectedOrg(null); setMembers(null); setInvites(null); setRoles(null); return }
    refreshOrgDetail(orgId)
  }

  async function createOrg() {
    if (!newOrgName.trim()) return
    setActionLoading('create')
    try {
      await postJson('/api/org', { name: newOrgName })
      setMessage('Organization created')
      setNewOrgName('')
      fetchOrgs()
    } catch (err) { setMessage(`Create failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function updateOrg() {
    if (!selectedOrg || !updateName.trim()) return
    setActionLoading('update')
    try {
      await patchJson(`/api/org/${encodeURIComponent(selectedOrg)}`, { name: updateName })
      setMessage('Organization updated')
      setUpdateName('')
      fetchOrgs()
    } catch (err) { setMessage(`Update failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function sendInvite() {
    if (!selectedOrg || !inviteEmail.trim()) return
    setActionLoading('invite')
    try {
      await postJson(`/api/org/${encodeURIComponent(selectedOrg)}/invites`, { email: inviteEmail })
      setMessage('Invite sent')
      setInviteEmail('')
      refreshOrgDetail(selectedOrg)
    } catch (err) { setMessage(`Invite failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function removeMember(userId) {
    if (!selectedOrg) return
    setActionLoading(`remove-${userId}`)
    try {
      await deleteJson(`/api/org/${encodeURIComponent(selectedOrg)}/members/${encodeURIComponent(userId)}`)
      setMessage('Member removed')
      refreshOrgDetail(selectedOrg)
    } catch (err) { setMessage(`Remove failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function acceptInvite() {
    if (!acceptInviteId.trim()) return
    setActionLoading('accept-invite')
    try {
      await postJson(`/api/org/invites/${encodeURIComponent(acceptInviteId)}/accept`, {})
      setMessage('Invite accepted')
      setAcceptInviteId('')
      if (selectedOrg) refreshOrgDetail(selectedOrg)
    } catch (err) { setMessage(`Accept failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  async function assignRole() {
    if (!selectedOrg || !assignRoleId || !assignUserId) return
    setActionLoading('assign-role')
    try {
      await postJson(`/api/org/${encodeURIComponent(selectedOrg)}/roles/${encodeURIComponent(assignRoleId)}/assign`, { userId: assignUserId })
      setMessage('Role assigned')
      setAssignUserId('')
      setAssignRoleId('')
    } catch (err) { setMessage(`Assign failed: ${err.message}`) }
    finally { setActionLoading('') }
  }

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Organizations</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Manage organizations, members, invites, and roles.</p>
            </div>
            <Button variant="filled" onClick={fetchOrgs}>Refresh</Button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
            </div>
          )}
          {message && <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300">{message}</p>}

          {/* Org list */}
          <section id="org-list" className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Organizations</h2>

            {/* Create */}
            <div className="mt-4 flex gap-2">
              <input className="flex-1 rounded-xl border border-zinc-950/10 bg-white px-4 py-2 text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-white" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="New org name" />
              <Button variant="filled" disabled={!newOrgName.trim() || actionLoading === 'create'} onClick={createOrg}>
                {actionLoading === 'create' ? 'Creating...' : 'Create'}
              </Button>
            </div>

            {loading ? <div className="mt-4"><SkeletonList /></div> : orgs && orgs.length > 0 ? (
              <div className="mt-4 space-y-3">
                {orgs.map((org) => {
                  const orgId = org.orgId || org.id || ''
                  return (
                    <div key={orgId} className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900">
                      <div className="flex items-center justify-between">
                        <button type="button" onClick={() => selectOrg(orgId)} className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-950 dark:text-white">{org.name || orgId}</span>
                          <Tag color={selectedOrg === orgId ? 'orange' : 'zinc'} variant="medium">{org.plan || org.status || 'active'}</Tag>
                        </button>
                        <span className="text-xs text-zinc-500">{org.memberCount != null ? `${org.memberCount} members` : ''}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500">No organizations found.</p>
              </div>
            )}
          </section>

          {selectedOrg && (
            <>
              {/* Update org */}
              <div className="mt-6 flex gap-2">
                <input className="flex-1 rounded-xl border border-zinc-950/10 bg-white px-4 py-2 text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-white" value={updateName} onChange={(e) => setUpdateName(e.target.value)} placeholder="New name" />
                <Button variant="secondary" disabled={!updateName.trim() || actionLoading === 'update'} onClick={updateOrg}>
                  {actionLoading === 'update' ? 'Updating...' : 'Update Org'}
                </Button>
              </div>

              {/* Members */}
              <section id="members" className="mt-8">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Members</h2>
                {members && members.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {members.map((m) => {
                      const uid = m.userId || m.id || m.email || ''
                      return (
                        <div key={uid} className="flex items-center justify-between rounded-xl border border-zinc-950/10 bg-white px-4 py-2 dark:border-white/10 dark:bg-zinc-900">
                          <div>
                            <span className="text-sm font-medium text-zinc-950 dark:text-white">{m.email || m.username || uid}</span>
                            {m.role && <Tag className="ml-2" color="zinc" variant="small">{m.role}</Tag>}
                          </div>
                          <Button variant="secondary" disabled={actionLoading === `remove-${uid}`} onClick={() => removeMember(uid)}>
                            {actionLoading === `remove-${uid}` ? 'Removing...' : 'Remove'}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                ) : <p className="mt-4 text-sm text-zinc-500">No members.</p>}
              </section>

              {/* Invites */}
              <section id="invites" className="mt-8">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Invites</h2>
                <div className="mt-4 flex gap-2">
                  <input className="flex-1 rounded-xl border border-zinc-950/10 bg-white px-4 py-2 text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-white" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email address" />
                  <Button variant="filled" disabled={!inviteEmail.trim() || actionLoading === 'invite'} onClick={sendInvite}>
                    {actionLoading === 'invite' ? 'Sending...' : 'Send Invite'}
                  </Button>
                </div>
                {invites && invites.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {invites.map((inv) => (
                      <div key={inv.inviteId || inv.id || inv.email} className="flex items-center justify-between rounded-xl border border-zinc-950/10 bg-white px-4 py-2 dark:border-white/10 dark:bg-zinc-900">
                        <span className="text-sm text-zinc-950 dark:text-white">{inv.email || '--'}</span>
                        <Tag color={inv.status === 'pending' ? 'amber' : inv.status === 'accepted' ? 'orange' : 'zinc'} variant="small">{inv.status || 'pending'}</Tag>
                      </div>
                    ))}
                  </div>
                ) : <p className="mt-4 text-sm text-zinc-500">No pending invites.</p>}
              </section>

              {/* Accept invite (POST /api/org/invites/:inviteId/accept) */}
              <section id="accept-invite" className="mt-8">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Accept invite</h2>
                <div className="mt-4 flex gap-2">
                  <input className="flex-1 rounded-xl border border-zinc-950/10 bg-white px-4 py-2 text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-white" value={acceptInviteId} onChange={(e) => setAcceptInviteId(e.target.value)} placeholder="Invite ID" />
                  <Button variant="filled" disabled={!acceptInviteId.trim() || actionLoading === 'accept-invite'} onClick={acceptInvite}>
                    {actionLoading === 'accept-invite' ? 'Accepting...' : 'Accept'}
                  </Button>
                </div>
              </section>

              {/* Roles */}
              <section id="roles" className="mt-8">
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Roles</h2>
                {roles && roles.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {roles.map((r) => (
                      <div key={r.roleId || r.id || r.name} className="rounded-xl border border-zinc-950/10 bg-white px-4 py-2 dark:border-white/10 dark:bg-zinc-900">
                        <span className="text-sm font-medium text-zinc-950 dark:text-white">{r.name || r.roleId || r.id}</span>
                        {r.description && <p className="mt-1 text-xs text-zinc-500">{r.description}</p>}
                      </div>
                    ))}
                  </div>
                ) : <p className="mt-4 text-sm text-zinc-500">No roles defined.</p>}

                <div className="mt-4 rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                  <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">Assign role</h3>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input className="rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-800 dark:text-white" value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} placeholder="User ID" />
                    <input className="rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-800 dark:text-white" value={assignRoleId} onChange={(e) => setAssignRoleId(e.target.value)} placeholder="Role ID" />
                  </div>
                  <Button className="mt-2" variant="filled" disabled={!assignUserId || !assignRoleId || actionLoading === 'assign-role'} onClick={assignRole}>
                    {actionLoading === 'assign-role' ? 'Assigning...' : 'Assign'}
                  </Button>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </article>
  )
}
