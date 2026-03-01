'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { DescriptionDetails, DescriptionList, DescriptionTerm } from '@/components/description-list'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Divider } from '@/components/divider'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Link } from '@/components/link'
import { Field, Label } from '@/components/fieldset'
import { ChevronLeftIcon } from '@heroicons/react/16/solid'
import { loadJson, postJson } from '@/lib/api'

function SkeletonDetail() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-6 flex items-center gap-4">
        <div className="h-7 w-48 rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="h-5 w-16 rounded-full bg-zinc-200 dark:bg-zinc-700" />
      </div>
      <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
        <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
              <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="mt-2 h-3 w-56 rounded bg-zinc-100 dark:bg-zinc-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function statusColor(status) {
  if (!status) return 'zinc'
  const s = status.toLowerCase()
  if (s === 'approved' || s === 'allow' || s === 'allowed') return 'green'
  if (s === 'denied' || s === 'block' || s === 'blocked' || s === 'rejected') return 'red'
  if (s === 'pending') return 'orange'
  return 'zinc'
}

function formatDate(dateStr) {
  if (!dateStr) return '--'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return dateStr
  }
}

export default function ModifierApprovalDetailPage() {
  const { approvalId } = useParams()
  const [approval, setApproval] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  // Decision dialog state
  const [showDecisionDialog, setShowDecisionDialog] = useState(false)
  const [decisionAction, setDecisionAction] = useState('')
  const [decisionReason, setDecisionReason] = useState('')
  const [decisionLoading, setDecisionLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadJson(`/api/openclaw/modifier/approvals/${approvalId}`)
        if (cancelled) return
        setApproval(data)
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('404')) {
            setNotFound(true)
          } else {
            setError(msg)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [approvalId])

  async function handleDecision() {
    if (!decisionAction) return
    setDecisionLoading(true)
    try {
      const res = await postJson(`/api/openclaw/modifier/approvals/${approvalId}/decision`, {
        action: decisionAction,
        reason: decisionReason,
      })
      if (res.ok) {
        setMessage('Decision submitted successfully.')
        setMessageType('success')
        setShowDecisionDialog(false)
        // Refresh approval
        const data = await loadJson(`/api/openclaw/modifier/approvals/${approvalId}`)
        setApproval(data)
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage(data.error || 'Failed to submit decision.')
        setMessageType('error')
      }
    } catch {
      setMessage('Failed to submit decision.')
      setMessageType('error')
    } finally {
      setDecisionLoading(false)
    }
  }

  if (loading) return <SkeletonDetail />

  if (notFound) {
    return (
      <>
        <div className="max-lg:hidden">
          <Link href="/modifier-approvals" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <ChevronLeftIcon className="size-4 fill-zinc-400 dark:fill-zinc-500" />
            Modifier Approvals
          </Link>
        </div>
        <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Approval not found</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            The approval &ldquo;{approvalId}&rdquo; does not exist.
          </p>
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <div className="max-lg:hidden">
          <Link href="/modifier-approvals" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            <ChevronLeftIcon className="size-4 fill-zinc-400 dark:fill-zinc-500" />
            Modifier Approvals
          </Link>
        </div>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            The gateway may be starting up or temporarily unavailable. Try refreshing the page.
          </p>
        </div>
      </>
    )
  }

  const status = approval?.status || approval?.decision || 'pending'

  return (
    <>
      <div className="max-lg:hidden">
        <Link href="/modifier-approvals" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
          <ChevronLeftIcon className="size-4 fill-zinc-400 dark:fill-zinc-500" />
          Modifier Approvals
        </Link>
      </div>
      <div className="mt-4 lg:mt-8">
        <div className="flex items-center gap-4">
          <Heading>Approval {typeof approvalId === 'string' ? approvalId.substring(0, 12) : approvalId}</Heading>
          <Badge color={statusColor(status)}>{status}</Badge>
        </div>
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

      <div className="mt-12">
        <Subheading>Approval Details</Subheading>
        <Divider className="mt-4" />
        <DescriptionList>
          <DescriptionTerm>Approval ID</DescriptionTerm>
          <DescriptionDetails className="font-mono text-xs">{approval?.approvalId || approval?.id || approvalId}</DescriptionDetails>
          <DescriptionTerm>Type</DescriptionTerm>
          <DescriptionDetails>{approval?.type || approval?.modifierType || '--'}</DescriptionDetails>
          <DescriptionTerm>Status</DescriptionTerm>
          <DescriptionDetails><Badge color={statusColor(status)}>{status}</Badge></DescriptionDetails>
          <DescriptionTerm>Requested</DescriptionTerm>
          <DescriptionDetails>{formatDate(approval?.requestedAt || approval?.createdAt)}</DescriptionDetails>
          <DescriptionTerm>Decided</DescriptionTerm>
          <DescriptionDetails>{formatDate(approval?.decidedAt || approval?.updatedAt)}</DescriptionDetails>
          {approval?.reason && (
            <>
              <DescriptionTerm>Reason</DescriptionTerm>
              <DescriptionDetails>{approval.reason}</DescriptionDetails>
            </>
          )}
          {approval?.modifier && (
            <>
              <DescriptionTerm>Modifier</DescriptionTerm>
              <DescriptionDetails>{typeof approval.modifier === 'string' ? approval.modifier : JSON.stringify(approval.modifier)}</DescriptionDetails>
            </>
          )}
        </DescriptionList>
      </div>

      <div className="mt-8 flex gap-3">
        <Button href="/modifier-approvals">Back to Approvals</Button>
        {status === 'pending' && (
          <>
            <Button
              color="green"
              onClick={() => {
                setShowDecisionDialog(true)
                setDecisionAction('approve')
                setDecisionReason('')
              }}
            >
              Approve
            </Button>
            <Button
              color="red"
              onClick={() => {
                setShowDecisionDialog(true)
                setDecisionAction('deny')
                setDecisionReason('')
              }}
            >
              Deny
            </Button>
          </>
        )}
      </div>

      {/* Decision Dialog */}
      <Dialog open={showDecisionDialog} onClose={() => setShowDecisionDialog(false)} size="sm">
        <DialogTitle>{decisionAction === 'approve' ? 'Approve' : 'Deny'} Request</DialogTitle>
        <DialogDescription>
          Provide a reason for {decisionAction === 'approve' ? 'approving' : 'denying'} this modifier approval.
        </DialogDescription>
        <DialogBody>
          <Field>
            <Label>Reason</Label>
            <Input
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
              placeholder="Enter reason..."
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowDecisionDialog(false)}>
            Cancel
          </Button>
          <Button
            color={decisionAction === 'approve' ? 'green' : 'red'}
            disabled={decisionLoading}
            onClick={handleDecision}
          >
            {decisionLoading ? 'Submitting...' : decisionAction === 'approve' ? 'Approve' : 'Deny'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
