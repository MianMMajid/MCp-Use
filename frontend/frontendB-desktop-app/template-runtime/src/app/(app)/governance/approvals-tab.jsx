'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogBody, DialogActions } from '@/components/dialog'
import { Divider } from '@/components/divider'
import { Select } from '@/components/select'
import { Subheading } from '@/components/heading'
import { Textarea } from '@/components/textarea'
import { Field, Label } from '@/components/fieldset'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, postJson } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'
import { SkeletonRows } from '@/components/skeleton'

export default function ApprovalsTab() {
  const [approvals, setApprovals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')

  // Confirmation dialog
  const [dialogApproval, setDialogApproval] = useState(null)
  const [dialogAction, setDialogAction] = useState(null) // 'approve' | 'deny'
  const [dialogComment, setDialogComment] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  async function fetchApprovals() {
    setLoading(true)
    try {
      const data = await loadJson('/api/openclaw/modifier/approvals')
      const items = Array.isArray(data) ? data
        : Array.isArray(data?.approvals) ? data.approvals
        : Array.isArray(data?.items) ? data.items
        : []
      setApprovals(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchApprovals() }, [])

  const filtered = filter === 'all'
    ? approvals
    : approvals.filter((a) => a.status === filter)

  function openDialog(approval, action) {
    setDialogApproval(approval)
    setDialogAction(action)
    setDialogComment('')
  }

  async function handleConfirm() {
    if (!dialogApproval || !dialogAction) return
    setActionLoading(true)
    try {
      const id = dialogApproval.id || dialogApproval.approvalId
      await postJson(`/api/openclaw/modifier/approvals/${id}/decision`, {
        decision: dialogAction === 'approve' ? 'approve' : 'reject',
        comment: dialogComment || undefined,
      })
      setDialogApproval(null)
      fetchApprovals()
    } catch {
      // keep dialog open on error
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-4">
        <Subheading>Approval Queue</Subheading>
        <div className="flex items-center gap-3">
          <Field className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Status:</Label>
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-36">
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
            </Select>
          </Field>
          <Button onClick={fetchApprovals}>Refresh</Button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{error}</p>
        </div>
      )}

      {loading && <SkeletonRows />}

      {!loading && filtered.length === 0 && (
        <div className="mt-6 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No approvals found</p>
          <p className="mt-1 text-xs text-zinc-500">
            {filter !== 'all' ? `No ${filter} approvals.` : 'No approval requests have been created yet.'}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
          <TableHead>
            <TableRow>
              <TableHeader>ID</TableHeader>
              <TableHeader>Tool / Action</TableHeader>
              <TableHeader>Requester</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Created</TableHeader>
              <TableHeader className="text-right">Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((approval, idx) => {
              const id = approval.id || approval.approvalId || idx
              const shortId = typeof id === 'string' ? id.substring(0, 10) : String(id)
              return (
                <TableRow key={id}>
                  <TableCell className="font-mono text-xs">{shortId}</TableCell>
                  <TableCell>{approval.tool || approval.action || approval.capability || '--'}</TableCell>
                  <TableCell>{approval.requester || approval.requestedBy || '--'}</TableCell>
                  <TableCell>
                    <Badge color={statusColor(approval.status)}>{approval.status || 'unknown'}</Badge>
                  </TableCell>
                  <TableCell className="text-zinc-500">{formatDate(approval.createdAt || approval.timestamp)}</TableCell>
                  <TableCell className="text-right">
                    {(approval.status === 'pending' || !approval.status) && (
                      <div className="flex justify-end gap-2">
                        <Button onClick={() => openDialog(approval, 'approve')}>Approve</Button>
                        <Button color="red" onClick={() => openDialog(approval, 'deny')}>Deny</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={dialogApproval !== null} onClose={() => setDialogApproval(null)} size="sm">
        <DialogTitle>
          {dialogAction === 'approve' ? 'Approve Request' : 'Deny Request'}
        </DialogTitle>
        <DialogBody>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            {dialogAction === 'approve'
              ? 'Are you sure you want to approve this request?'
              : 'Are you sure you want to deny this request?'}
          </p>
          <Field>
            <Label>Comment (optional)</Label>
            <Textarea
              rows={3}
              value={dialogComment}
              onChange={(e) => setDialogComment(e.target.value)}
              placeholder="Add a comment..."
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setDialogApproval(null)}>Cancel</Button>
          <Button
            disabled={actionLoading}
            color={dialogAction === 'deny' ? 'red' : undefined}
            onClick={handleConfirm}
          >
            {actionLoading ? 'Processing...' : dialogAction === 'approve' ? 'Approve' : 'Deny'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
