'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Divider } from '@/components/divider'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/table'
import { Text } from '@/components/text'
import { loadJson, postJson, deleteJson } from '@/lib/api'

function SkeletonList() {
  return (
    <div className="animate-pulse space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div className="h-4 w-48 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="mt-2 h-3 w-24 rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
      ))}
    </div>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return '--'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function isExpired(dateStr) {
  if (!dateStr) return false
  try {
    return new Date(dateStr) < new Date()
  } catch {
    return false
  }
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  // Create key dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyExpires, setNewKeyExpires] = useState('')
  const [creating, setCreating] = useState(false)

  // Token reveal state
  const [revealedToken, setRevealedToken] = useState(null)
  const [revealedKeyName, setRevealedKeyName] = useState('')
  const [copied, setCopied] = useState(false)

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function fetchKeys() {
    try {
      const data = await loadJson('/api/user/api-keys')
      setKeys(data?.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadJson('/api/user/api-keys')
        if (cancelled) return
        setKeys(data?.items || [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function handleCreateKey(e) {
    e.preventDefault()
    setCreating(true)
    setMessage('')

    try {
      const body = { name: newKeyName }
      if (newKeyExpires) body.expiresAt = newKeyExpires

      const res = await postJson('/api/user/api-keys', body)
      const data = await res.json()

      if (res.ok && data.ok) {
        setRevealedToken(data.key.token)
        setRevealedKeyName(data.key.name)
        setCreateDialogOpen(false)
        setNewKeyName('')
        setNewKeyExpires('')
        // Refresh the key list
        await fetchKeys()
      } else {
        setMessage(data.error || 'Could not create API key.')
        setMessageType('error')
      }
    } catch {
      setMessage('Failed to create API key.')
      setMessageType('error')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteKey() {
    if (!deleteTarget) return
    setDeleting(true)
    setMessage('')

    try {
      const res = await fetch(`/api/user/api-keys/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      const data = await res.json()

      if (res.ok && data.ok) {
        setKeys((prev) => (prev || []).filter((k) => k.id !== deleteTarget.id))
        setMessage(`API key "${deleteTarget.name}" deleted.`)
        setMessageType('success')
      } else {
        setMessage(data.error || 'Could not delete API key.')
        setMessageType('error')
      }
    } catch {
      setMessage('Failed to delete API key.')
      setMessageType('error')
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
      setDeleteTarget(null)
    }
  }

  async function handleCopyToken() {
    if (!revealedToken) return
    try {
      await navigator.clipboard.writeText(revealedToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select the text
      const el = document.getElementById('revealed-token')
      if (el) {
        const range = document.createRange()
        range.selectNodeContents(el)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <Heading>API Keys</Heading>
        <Divider className="my-10 mt-6" />
        <SkeletonList />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <Heading>API Keys</Heading>
        <Button color="orange" onClick={() => setCreateDialogOpen(true)}>
          Create Key
        </Button>
      </div>

      {message && (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
          messageType === 'success'
            ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300'
            : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
        }`}>
          {message}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">The gateway may be starting up or temporarily unavailable. Try refreshing the page.</p>
        </div>
      )}

      {/* Token reveal banner */}
      {revealedToken && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
          <div className="flex items-center justify-between">
            <Subheading level={3}>
              New API Key: {revealedKeyName}
            </Subheading>
            <Button
              plain
              onClick={() => {
                setRevealedToken(null)
                setRevealedKeyName('')
                setCopied(false)
              }}
            >
              Dismiss
            </Button>
          </div>
          <pre
            id="revealed-token"
            className="mt-2 overflow-x-auto rounded-md border border-green-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 dark:border-green-800 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {revealedToken}
          </pre>
          <div className="mt-2 flex items-center gap-3">
            <Button onClick={handleCopyToken} outline>
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </Button>
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
              This token will only be shown once. Store it securely.
            </p>
          </div>
        </div>
      )}

      <Divider className="my-10 mt-6" />

      {/* Keys Table */}
      {keys === null || keys.length === 0 ? (
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <Text>No API keys created yet.</Text>
          <div className="mt-4">
            <Button outline onClick={() => setCreateDialogOpen(true)}>
              Create your first key
            </Button>
          </div>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Fingerprint</TableHeader>
              <TableHeader>Created</TableHeader>
              <TableHeader>Expires</TableHeader>
              <TableHeader className="text-right">Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {keys.map((key) => {
              const expired = isExpired(key.expiresAt)
              return (
                <TableRow key={key.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-950 dark:text-white">{key.name}</span>
                      {expired && <Badge color="red">Expired</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="rounded border border-zinc-950/10 bg-zinc-950/2.5 px-1 py-0.5 font-mono text-xs text-zinc-700 dark:border-white/20 dark:bg-white/5 dark:text-zinc-300">
                      {key.fingerprint || '--'}
                    </code>
                  </TableCell>
                  <TableCell>{formatDate(key.createdAt)}</TableCell>
                  <TableCell>
                    {key.expiresAt ? (
                      <span className={expired ? 'text-red-600 dark:text-red-400' : ''}>
                        {formatDate(key.expiresAt)}
                      </span>
                    ) : (
                      <span className="text-zinc-400 dark:text-zinc-500">Never</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      color="red"
                      onClick={() => {
                        setDeleteTarget(key)
                        setDeleteDialogOpen(true)
                      }}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {/* Create Key Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
        <DialogTitle>Create API Key</DialogTitle>
        <DialogDescription>
          Generate a new API key to authenticate your requests. Optionally set an expiration date.
        </DialogDescription>
        <form onSubmit={handleCreateKey}>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                  Key Name
                </label>
                <Input
                  className="mt-1"
                  name="name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Production API"
                  required
                  aria-label="Key Name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                  Expires At <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                </label>
                <Input
                  className="mt-1"
                  type="date"
                  name="expiresAt"
                  value={newKeyExpires}
                  onChange={(e) => setNewKeyExpires(e.target.value)}
                  aria-label="Expiration Date"
                />
              </div>
            </div>
          </DialogBody>
          <DialogActions>
            <Button plain onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" color="orange" disabled={creating || !newKeyName.trim()}>
              {creating ? 'Creating...' : 'Create Key'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete API Key</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete the key <strong>&quot;{deleteTarget?.name}&quot;</strong>? This action cannot be undone. Any applications using this key will lose access immediately.
        </DialogDescription>
        <DialogActions>
          <Button plain onClick={() => setDeleteDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={handleDeleteKey}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Key'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
