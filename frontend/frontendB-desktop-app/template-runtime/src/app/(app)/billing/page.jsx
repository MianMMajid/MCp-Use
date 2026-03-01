'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Divider } from '@/components/divider'
import { Heading, Subheading } from '@/components/heading'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/table'
import { Text } from '@/components/text'
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

const statusBadgeColor = {
  active: 'green',
  trialing: 'blue',
  past_due: 'orange',
  canceled: 'red',
  incomplete: 'amber',
  unpaid: 'red',
}

const invoiceStatusColor = {
  paid: 'green',
  open: 'blue',
  draft: 'zinc',
  void: 'zinc',
  uncollectible: 'red',
}

function formatCurrency(amount, currency) {
  if (amount == null) return '--'
  const value = amount / 100
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'usd' }).format(value)
  } catch {
    return `$${value.toFixed(2)}`
  }
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

export default function BillingPage() {
  const [subscription, setSubscription] = useState(null)
  const [billingEnabled, setBillingEnabled] = useState(true)
  const [billingMode, setBillingMode] = useState(null)
  const [invoices, setInvoices] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [subData, invoiceData] = await Promise.all([
          loadJson('/api/billing/subscription').catch(() => null),
          loadJson('/api/billing/invoices?limit=20').catch(() => null),
        ])
        if (cancelled) return

        if (subData) {
          setBillingEnabled(subData.billingEnabled !== false)
          setBillingMode(subData.billingMode || null)
          setSubscription(subData.subscription || null)
        } else {
          setBillingEnabled(false)
        }

        setInvoices(invoiceData?.items || [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function handleManageBilling() {
    setActionLoading('portal')
    setMessage('')
    try {
      const res = await postJson('/api/billing/portal-session', {})
      const data = await res.json().catch(() => ({}))
      if (data.ok && data.url) {
        window.location.href = data.url
      } else {
        setMessage('Could not open billing portal.')
        setMessageType('error')
      }
    } catch {
      setMessage('Failed to open billing portal.')
      setMessageType('error')
    } finally {
      setActionLoading('')
    }
  }

  async function handleUpgrade(plan) {
    setActionLoading('upgrade')
    setMessage('')
    try {
      const res = await postJson('/api/billing/create-checkout-session', { plan })
      const data = await res.json().catch(() => ({}))
      if (data.ok && data.url) {
        window.location.href = data.url
      } else {
        setMessage('Could not start checkout session.')
        setMessageType('error')
      }
    } catch {
      setMessage('Failed to start checkout.')
      setMessageType('error')
    } finally {
      setActionLoading('')
    }
  }

  async function handleCancel() {
    setActionLoading('cancel')
    setMessage('')
    try {
      const res = await postJson('/api/billing/subscription/cancel', { atPeriodEnd: true })
      const data = await res.json().catch(() => ({}))
      if (data.ok) {
        setSubscription((prev) => ({
          ...prev,
          status: data.status || prev?.status,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? true,
          currentPeriodEnd: data.currentPeriodEnd || prev?.currentPeriodEnd,
        }))
        setMessage('Subscription will be canceled at the end of the current period.')
        setMessageType('success')
      } else {
        setMessage('Could not cancel subscription.')
        setMessageType('error')
      }
    } catch {
      setMessage('Failed to cancel subscription.')
      setMessageType('error')
    } finally {
      setCancelDialogOpen(false)
      setActionLoading('')
    }
  }

  async function handleResume() {
    setActionLoading('resume')
    setMessage('')
    try {
      const res = await postJson('/api/billing/subscription/resume', {})
      const data = await res.json().catch(() => ({}))
      if (data.ok) {
        setSubscription((prev) => ({
          ...prev,
          status: data.status || prev?.status,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
        }))
        setMessage('Subscription resumed successfully.')
        setMessageType('success')
      } else {
        setMessage('Could not resume subscription.')
        setMessageType('error')
      }
    } catch {
      setMessage('Failed to resume subscription.')
      setMessageType('error')
    } finally {
      setActionLoading('')
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <Heading>Billing</Heading>
        <Divider className="my-10 mt-6" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <Divider className="my-10" soft />
        <SkeletonList />
      </div>
    )
  }

  if (!billingEnabled) {
    return (
      <div className="mx-auto max-w-4xl">
        <Heading>Billing</Heading>
        <Divider className="my-10 mt-6" />
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <Subheading>Billing is not configured</Subheading>
          <Text className="mt-2">
            Billing has not been enabled for this instance. Contact your administrator to configure payment processing.
          </Text>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Heading>Billing</Heading>

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

      <Divider className="my-10 mt-6" />

      {/* Current Plan */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <Subheading>Current Plan</Subheading>
          <div className="mt-3 flex items-center gap-2">
            <p className="text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
              {subscription?.plan || 'Free'}
            </p>
            <Badge color={statusBadgeColor[subscription?.status] || 'zinc'}>
              {subscription?.status || 'inactive'}
            </Badge>
          </div>
          {subscription?.cancelAtPeriodEnd && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Cancels at end of period
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <Subheading>Current Period End</Subheading>
          <p className="mt-3 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
            {formatDate(subscription?.currentPeriodEnd)}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {billingMode ? `Mode: ${billingMode}` : 'Billing cycle renewal'}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          onClick={handleManageBilling}
          disabled={actionLoading === 'portal'}
          outline
        >
          {actionLoading === 'portal' ? 'Opening...' : 'Manage Billing'}
        </Button>

        <Button
          color="orange"
          onClick={() => handleUpgrade('pro')}
          disabled={actionLoading === 'upgrade'}
        >
          {actionLoading === 'upgrade' ? 'Redirecting...' : 'Upgrade Plan'}
        </Button>

        {subscription?.cancelAtPeriodEnd ? (
          <Button
            color="green"
            onClick={handleResume}
            disabled={actionLoading === 'resume'}
          >
            {actionLoading === 'resume' ? 'Resuming...' : 'Resume Subscription'}
          </Button>
        ) : subscription?.status === 'active' || subscription?.status === 'trialing' ? (
          <Button
            color="red"
            onClick={() => setCancelDialogOpen(true)}
            disabled={actionLoading === 'cancel'}
          >
            Cancel Subscription
          </Button>
        ) : null}
      </div>

      <Divider className="my-10" soft />

      {/* Invoices */}
      <Subheading>Invoices</Subheading>
      <div className="mt-4">
        {invoices === null ? (
          <SkeletonList />
        ) : invoices.length === 0 ? (
          <div className="rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
            <Text>No invoices yet.</Text>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Date</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Amount</TableHeader>
                <TableHeader>Invoice</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>{formatDate(inv.createdAt)}</TableCell>
                  <TableCell>
                    <Badge color={invoiceStatusColor[inv.status] || 'zinc'}>
                      {inv.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(inv.amount, inv.currency)}
                  </TableCell>
                  <TableCell>
                    {inv.hostedInvoiceUrl ? (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 underline hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-sm text-zinc-400 dark:text-zinc-500">--</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelDialogOpen} onClose={() => setCancelDialogOpen(false)}>
        <DialogTitle>Cancel Subscription</DialogTitle>
        <DialogDescription>
          Are you sure you want to cancel? Your plan will remain active until{' '}
          <strong>{formatDate(subscription?.currentPeriodEnd)}</strong>.
        </DialogDescription>
        <DialogBody>
          <Text>
            After that date, you will lose access to premium features. You can resume your subscription at any time before the period ends.
          </Text>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setCancelDialogOpen(false)}>
            Keep Subscription
          </Button>
          <Button
            color="red"
            onClick={handleCancel}
            disabled={actionLoading === 'cancel'}
          >
            {actionLoading === 'cancel' ? 'Canceling...' : 'Yes, Cancel'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
