'use client'

import { useEffect, useState } from 'react'
import { loadJson, postJson, deleteJson } from '@/lib/api'
import { Heading, Subheading } from '@/components/heading'
import { Badge } from '@/components/badge'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '@/components/table'
import { Button } from '@/components/button'
import { Divider } from '@/components/divider'

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell>
        <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
      </TableCell>
      <TableCell>
        <div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
      </TableCell>
      <TableCell>
        <div className="h-4 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
      </TableCell>
      <TableCell>
        <div className="h-4 w-10 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
      </TableCell>
      <TableCell>
        <div className="h-4 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
      </TableCell>
    </TableRow>
  )
}

export default function ServiceAccountsPage() {
  const [accounts, setAccounts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  // Expanded account for key management
  const [expandedId, setExpandedId] = useState(null)
  const [keys, setKeys] = useState(null)
  const [keysLoading, setKeysLoading] = useState(false)
  const [newKeyValue, setNewKeyValue] = useState(null)
  const [generatingKey, setGeneratingKey] = useState(false)

  // Use a default orgId (from context or first available)
  const orgId = 'default'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadJson(`/api/org/${orgId}/service-accounts`)
        if (cancelled) return
        setAccounts(
          Array.isArray(data) ? data : data.accounts ?? data.items ?? [],
        )
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleCreate() {
    setCreating(true)
    setMessage('')
    try {
      const res = await postJson(`/api/org/${orgId}/service-accounts`, {
        name: newName,
        description: newDesc,
      })
      const data = await res.json()
      if (res.ok) {
        setAccounts((prev) => [
          ...(prev ?? []),
          data.account ?? data,
        ])
        setMessage('Service account created.')
        setMessageType('success')
        setNewName('')
        setNewDesc('')
        setShowCreateForm(false)
      } else {
        setMessage(data.message ?? 'Failed to create account.')
        setMessageType('error')
      }
    } catch {
      setMessage('Failed to create service account.')
      setMessageType('error')
    } finally {
      setCreating(false)
    }
  }

  async function handleExpand(accountId) {
    if (expandedId === accountId) {
      setExpandedId(null)
      setKeys(null)
      setNewKeyValue(null)
      return
    }
    setExpandedId(accountId)
    setKeysLoading(true)
    setNewKeyValue(null)
    try {
      const data = await loadJson(
        `/api/org/${orgId}/service-accounts/${accountId}/keys`,
      )
      setKeys(Array.isArray(data) ? data : data.keys ?? data.items ?? [])
    } catch {
      setKeys([])
    } finally {
      setKeysLoading(false)
    }
  }

  async function handleGenerateKey(accountId) {
    setGeneratingKey(true)
    setMessage('')
    setNewKeyValue(null)
    try {
      const res = await postJson(
        `/api/org/${orgId}/service-accounts/${accountId}/keys`,
        {},
      )
      const data = await res.json()
      if (res.ok) {
        setNewKeyValue(data.key ?? data.apiKey ?? data.secret ?? data.value)
        setMessage('Key generated. Copy it now — it will not be shown again.')
        setMessageType('success')
        // Refresh keys list
        const keysData = await loadJson(
          `/api/org/${orgId}/service-accounts/${accountId}/keys`,
        )
        setKeys(
          Array.isArray(keysData)
            ? keysData
            : keysData.keys ?? keysData.items ?? [],
        )
      } else {
        setMessage(data.message ?? 'Failed to generate key.')
        setMessageType('error')
      }
    } catch {
      setMessage('Failed to generate key.')
      setMessageType('error')
    } finally {
      setGeneratingKey(false)
    }
  }

  async function handleRevokeKey(accountId, keyId) {
    setMessage('')
    try {
      await deleteJson(
        `/api/org/${orgId}/service-accounts/${accountId}/keys/${keyId}`,
      )
      setKeys((prev) => (prev ? prev.filter((k) => (k.id ?? k.keyId) !== keyId) : prev))
      setMessage('Key revoked.')
      setMessageType('success')
    } catch {
      setMessage('Failed to revoke key.')
      setMessageType('error')
    }
  }

  function handleCopyKey() {
    if (newKeyValue) {
      navigator.clipboard.writeText(newKeyValue).catch(() => {})
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <Heading>Service Accounts</Heading>
        <Divider className="my-10 mt-6" />
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Description</TableHeader>
              <TableHeader>Created</TableHeader>
              <TableHeader>Keys</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Heading>Service Accounts</Heading>

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
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Failed to load service accounts
          </p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            {error}
          </p>
        </div>
      )}

      <Divider className="my-10 mt-6" />

      <div className="flex items-center justify-between">
        <Subheading>Accounts</Subheading>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          New Service Account
        </Button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="mt-4 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                placeholder="my-service-account"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                Description
              </label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                placeholder="Service account for CI/CD pipeline"
              />
            </div>
            <div className="flex gap-2">
              <Button
                color="orange"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
              >
                {creating ? 'Creating...' : 'Create'}
              </Button>
              <Button plain onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Accounts table */}
      <div className="mt-4">
        {accounts && accounts.length > 0 ? (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Description</TableHeader>
                  <TableHeader>Created</TableHeader>
                  <TableHeader>Keys</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {accounts.map((acct, idx) => (
                  <TableRow key={acct.id ?? idx}>
                    <TableCell className="font-medium">
                      {acct.name ?? acct.id ?? `Account ${idx + 1}`}
                    </TableCell>
                    <TableCell>
                      {acct.description ?? '-'}
                    </TableCell>
                    <TableCell>
                      {acct.createdAt
                        ? new Date(acct.createdAt).toLocaleDateString()
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge color="zinc">
                        {acct.keyCount ?? acct.keys?.length ?? '?'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        plain
                        onClick={() => handleExpand(acct.id)}
                      >
                        {expandedId === acct.id ? 'Collapse' : 'Manage Keys'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Expanded key management */}
            {expandedId && (
              <div className="mt-4 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
                <div className="flex items-center justify-between">
                  <Subheading>
                    API Keys
                  </Subheading>
                  <Button
                    onClick={() => handleGenerateKey(expandedId)}
                    disabled={generatingKey}
                  >
                    {generatingKey ? 'Generating...' : 'Generate Key'}
                  </Button>
                </div>

                {/* Newly generated key display */}
                {newKeyValue && (
                  <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-900 dark:bg-orange-950/40">
                    <p className="text-xs font-medium text-orange-800 dark:text-orange-300">
                      Copy this key now. It will not be shown again.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 rounded bg-white px-2 py-1 font-mono text-xs text-zinc-950 dark:bg-zinc-900 dark:text-white">
                        {newKeyValue}
                      </code>
                      <Button plain onClick={handleCopyKey}>
                        Copy
                      </Button>
                    </div>
                  </div>
                )}

                {keysLoading ? (
                  <div className="mt-3 animate-pulse">
                    <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
                    <div className="mt-2 h-4 w-48 rounded bg-zinc-200 dark:bg-zinc-700" />
                  </div>
                ) : keys && keys.length > 0 ? (
                  <Table className="mt-3">
                    <TableHead>
                      <TableRow>
                        <TableHeader>Key ID</TableHeader>
                        <TableHeader>Created</TableHeader>
                        <TableHeader>Actions</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {keys.map((key, i) => (
                        <TableRow key={key.id ?? key.keyId ?? i}>
                          <TableCell className="font-mono text-xs">
                            {key.id ?? key.keyId ?? key.prefix ?? `key-${i + 1}`}
                          </TableCell>
                          <TableCell>
                            {key.createdAt
                              ? new Date(key.createdAt).toLocaleDateString()
                              : '-'}
                          </TableCell>
                          <TableCell>
                            <Button
                              color="red"
                              plain
                              onClick={() =>
                                handleRevokeKey(
                                  expandedId,
                                  key.id ?? key.keyId,
                                )
                              }
                            >
                              Revoke
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                    No keys for this account.
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No service accounts found. Create one to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
