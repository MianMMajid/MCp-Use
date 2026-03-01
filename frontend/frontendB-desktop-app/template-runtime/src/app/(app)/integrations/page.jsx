'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Divider } from '@/components/divider'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Text } from '@/components/text'
import { Field, Label } from '@/components/fieldset'
import { loadJson, postJson } from '@/lib/api'

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 h-8 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-2 h-3 w-32 rounded bg-zinc-100 dark:bg-zinc-800" />
    </div>
  )
}

function statusColor(status) {
  if (status === 'connected') return 'green'
  if (status === 'error') return 'red'
  return 'zinc'
}

function authTypeColor(authType) {
  if (authType === 'oauth') return 'blue'
  if (authType === 'token') return 'purple'
  return 'zinc'
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-6xl">
        <Heading>Integrations</Heading>
        <Text className="mt-2">Connect your favorite tools and services.</Text>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      </div>
    }>
      <IntegrationsContent />
    </Suspense>
  )
}

function IntegrationsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [catalog, setCatalog] = useState([])
  const [integrations, setIntegrations] = useState([])
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  // Dialog state for token connect
  const [connectDialog, setConnectDialog] = useState(null)
  const [credential, setCredential] = useState('')
  const [connectLoading, setConnectLoading] = useState(false)

  // Dialog state for disconnect confirmation
  const [disconnectDialog, setDisconnectDialog] = useState(null)
  const [disconnectLoading, setDisconnectLoading] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [catalogData, integrationsData] = await Promise.all([
        loadJson('/api/integrations/catalog').catch(() => ({ providers: [] })),
        loadJson('/api/integrations').catch(() => ({ items: [] })),
      ])
      setCatalog(Array.isArray(catalogData?.providers) ? catalogData.providers : [])
      setIntegrations(Array.isArray(integrationsData?.items) ? integrationsData.items : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle OAuth callback search params
  useEffect(() => {
    const oauthResult = searchParams.get('oauth')
    if (oauthResult === 'success') {
      setMessage('Integration connected successfully via OAuth.')
      setMessageType('success')
      router.replace('/integrations', { scroll: false })
      fetchData()
    } else if (oauthResult === 'error') {
      setMessage('OAuth connection failed. Please try again.')
      setMessageType('error')
      router.replace('/integrations', { scroll: false })
    }
  }, [searchParams, router, fetchData])

  // Merge catalog with user integrations
  const mergedIntegrations = catalog.map((provider) => {
    const userIntegration = integrations.find((i) => i.provider === provider.id)
    return {
      ...provider,
      userIntegration,
      connected: userIntegration?.status === 'connected',
    }
  })

  async function handleConnectToken(provider) {
    setConnectLoading(true)
    try {
      const res = await postJson(`/api/integrations/${provider}/connect`, {
        credential,
      })
      if (res.ok) {
        setMessage('Integration connected successfully.')
        setMessageType('success')
        setConnectDialog(null)
        setCredential('')
        await fetchData()
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage(data.error || 'Failed to connect integration.')
        setMessageType('error')
      }
    } catch (err) {
      setMessage('Failed to connect integration.')
      setMessageType('error')
    } finally {
      setConnectLoading(false)
    }
  }

  async function handleDisconnect(provider) {
    setDisconnectLoading(true)
    try {
      const res = await postJson(`/api/integrations/${provider}/disconnect`, {})
      if (res.ok) {
        setMessage('Integration disconnected.')
        setMessageType('success')
        setDisconnectDialog(null)
        await fetchData()
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage(data.error || 'Failed to disconnect integration.')
        setMessageType('error')
      }
    } catch (err) {
      setMessage('Failed to disconnect integration.')
      setMessageType('error')
    } finally {
      setDisconnectLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <Heading>Integrations</Heading>
        <Text className="mt-2">Connect your favorite tools and services.</Text>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Heading>Integrations</Heading>
      <Text className="mt-2">Connect your favorite tools and services to Maple.</Text>

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

      {mergedIntegrations.length === 0 && !error && (
        <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <Subheading>No integrations available</Subheading>
          <Text className="mt-2">No integration providers have been configured yet.</Text>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mergedIntegrations.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900"
          >
            <div className="flex items-center gap-3">
              <Avatar
                initials={item.displayName?.charAt(0)?.toUpperCase() || item.id?.charAt(0)?.toUpperCase() || '?'}
                className="size-10 bg-orange-500 text-white"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
                  {item.displayName || item.id}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge color={authTypeColor(item.defaultAuthType)}>{item.defaultAuthType || 'unknown'}</Badge>
                  <Badge color={item.connected ? 'green' : 'zinc'}>
                    {item.connected ? 'connected' : 'disconnected'}
                  </Badge>
                </div>
              </div>
            </div>

            {item.connected && item.userIntegration && (
              <div className="mt-4 space-y-1">
                {item.userIntegration.externalAccountId && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Account: {item.userIntegration.externalAccountId}
                  </p>
                )}
                {item.userIntegration.connectedAt && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Connected: {new Date(item.userIntegration.connectedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}

            <div className="mt-4">
              {item.connected ? (
                <Button
                  color="red"
                  className="w-full"
                  onClick={() => setDisconnectDialog(item)}
                >
                  Disconnect
                </Button>
              ) : item.oauth?.configured || item.defaultAuthType === 'oauth' ? (
                <Button
                  color="blue"
                  className="w-full"
                  onClick={() => {
                    window.location.href = `/api/integrations/${item.id}/oauth/start?redirect=true&returnTo=/integrations`
                  }}
                >
                  Connect with OAuth
                </Button>
              ) : (
                <Button
                  color="orange"
                  className="w-full"
                  onClick={() => {
                    setConnectDialog(item)
                    setCredential('')
                  }}
                >
                  Connect
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Token Connect Dialog */}
      <Dialog open={connectDialog !== null} onClose={() => setConnectDialog(null)} size="sm">
        <DialogTitle>Connect {connectDialog?.displayName || connectDialog?.id}</DialogTitle>
        <DialogDescription>Enter your API token or credential to connect this integration.</DialogDescription>
        <DialogBody>
          <Field>
            <Label>Credential / API Token</Label>
            <Input
              type="password"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              placeholder="Enter your token..."
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setConnectDialog(null)}>
            Cancel
          </Button>
          <Button
            color="orange"
            disabled={!credential.trim() || connectLoading}
            onClick={() => handleConnectToken(connectDialog?.id)}
          >
            {connectLoading ? 'Connecting...' : 'Connect'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={disconnectDialog !== null} onClose={() => setDisconnectDialog(null)} size="sm">
        <DialogTitle>Disconnect {disconnectDialog?.displayName || disconnectDialog?.id}?</DialogTitle>
        <DialogDescription>
          This will remove the connection. You can reconnect at any time.
        </DialogDescription>
        <DialogActions>
          <Button plain onClick={() => setDisconnectDialog(null)}>
            Cancel
          </Button>
          <Button
            color="red"
            disabled={disconnectLoading}
            onClick={() => handleDisconnect(disconnectDialog?.id)}
          >
            {disconnectLoading ? 'Disconnecting...' : 'Disconnect'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
