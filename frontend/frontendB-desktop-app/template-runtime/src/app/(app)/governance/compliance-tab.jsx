'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogBody, DialogActions } from '@/components/dialog'
import { Divider } from '@/components/divider'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Subheading } from '@/components/heading'
import { Textarea } from '@/components/textarea'
import { Field, Label } from '@/components/fieldset'
import { DescriptionList, DescriptionTerm, DescriptionDetails } from '@/components/description-list'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, postJson, getCached } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'
import { SkeletonRows } from '@/components/skeleton'

export default function ComplianceTab() {
  const [loading, setLoading] = useState(true)
  const [breakGlass, setBreakGlass] = useState(null)
  const [auditChain, setAuditChain] = useState(null)
  const [retention, setRetention] = useState(null)
  const [webhooks, setWebhooks] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Webhook dialog
  const [showWebhookDialog, setShowWebhookDialog] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEvents, setWebhookEvents] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [webhookSaving, setWebhookSaving] = useState(false)

  // Report dialog
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')
  const [reportResult, setReportResult] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)

  // Retention edit
  const [showRetentionDialog, setShowRetentionDialog] = useState(false)
  const [retentionValue, setRetentionValue] = useState('')
  const [retentionSaving, setRetentionSaving] = useState(false)

  async function fetchAll() {
    setLoading(true)
    try {
      const [bg, ac, ret, wh] = await Promise.all([
        loadJson('/api/operations/orchestrations/break-glass').catch(() => null),
        loadJson('/api/operations/orchestrations/audit-chain').catch(() => null),
        loadJson('/api/operations/orchestrations/retention').catch(() => null),
        loadJson('/api/operations/orchestrations/alert-webhooks').catch(() => null),
      ])
      setBreakGlass(bg)
      setAuditChain(ac)
      setRetention(ret)
      setWebhooks(Array.isArray(wh) ? wh : Array.isArray(wh?.webhooks) ? wh.webhooks : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  async function handleActivateBreakGlass() {
    try {
      await postJson('/api/operations/orchestrations/break-glass', {})
      setMessage('Break-glass activated')
      fetchAll()
    } catch {
      setMessage('Failed to activate break-glass')
    }
  }

  async function handleVerifyAuditChain() {
    try {
      const data = await loadJson('/api/operations/orchestrations/audit-chain/verify')
      setAuditChain(data)
      setMessage('Audit chain verified')
    } catch {
      setMessage('Verification failed')
    }
  }

  async function handleSaveWebhook() {
    setWebhookSaving(true)
    try {
      await postJson('/api/operations/orchestrations/alert-webhooks', {
        url: webhookUrl,
        events: webhookEvents.split(',').map((s) => s.trim()).filter(Boolean),
        secret: webhookSecret || undefined,
      })
      setShowWebhookDialog(false)
      setMessage('Webhook added')
      fetchAll()
    } catch {
      setMessage('Failed to add webhook')
    } finally {
      setWebhookSaving(false)
    }
  }

  async function handleGenerateReport() {
    setReportLoading(true)
    setReportResult(null)
    try {
      const res = await postJson('/api/operations/orchestrations/compliance/report', {
        from: reportFrom || undefined,
        to: reportTo || undefined,
      })
      const data = await res.json().catch(() => ({}))
      setReportResult(data)
    } catch {
      setReportResult({ error: 'Report generation failed' })
    } finally {
      setReportLoading(false)
    }
  }

  async function handleSaveRetention() {
    setRetentionSaving(true)
    try {
      let body
      try { body = JSON.parse(retentionValue) } catch { body = { days: parseInt(retentionValue) || 90 } }
      await postJson('/api/operations/orchestrations/retention', body)
      setShowRetentionDialog(false)
      setMessage('Retention policy updated')
      fetchAll()
    } catch {
      setMessage('Failed to update retention')
    } finally {
      setRetentionSaving(false)
    }
  }

  if (loading) return <SkeletonRows />

  return (
    <div className="mt-4 space-y-8">
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{error}</p>
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 dark:border-sky-900 dark:bg-sky-950/40">
          <p className="text-sm text-sky-800 dark:text-sky-300">{message}</p>
        </div>
      )}

      {/* Break-Glass */}
      <div>
        <div className="flex items-center justify-between">
          <Subheading>Break-Glass</Subheading>
          <Button color="red" onClick={handleActivateBreakGlass}>Activate Break-Glass</Button>
        </div>
        {breakGlass && typeof breakGlass === 'object' ? (
          <DescriptionList className="mt-3">
            <DescriptionTerm>Status</DescriptionTerm>
            <DescriptionDetails>
              <Badge color={statusColor(breakGlass.status || breakGlass.active ? 'active' : 'inactive')}>
                {breakGlass.status || (breakGlass.active ? 'Active' : 'Inactive')}
              </Badge>
            </DescriptionDetails>
            {breakGlass.activatedAt && (
              <>
                <DescriptionTerm>Activated</DescriptionTerm>
                <DescriptionDetails>{formatDate(breakGlass.activatedAt)}</DescriptionDetails>
              </>
            )}
            {breakGlass.activatedBy && (
              <>
                <DescriptionTerm>Activated By</DescriptionTerm>
                <DescriptionDetails>{breakGlass.activatedBy}</DescriptionDetails>
              </>
            )}
          </DescriptionList>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No break-glass data available.</p>
        )}
      </div>

      <Divider />

      {/* Audit Chain */}
      <div>
        <div className="flex items-center justify-between">
          <Subheading>Audit Chain Integrity</Subheading>
          <Button onClick={handleVerifyAuditChain}>Verify</Button>
        </div>
        {auditChain && typeof auditChain === 'object' ? (
          <DescriptionList className="mt-3">
            {Object.entries(auditChain).map(([key, value]) => (
              <div key={key}>
                <DescriptionTerm>{key}</DescriptionTerm>
                <DescriptionDetails>
                  {key.toLowerCase().includes('status') || key.toLowerCase().includes('integrity')
                    ? <Badge color={statusColor(String(value))}>{String(value)}</Badge>
                    : typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </DescriptionDetails>
              </div>
            ))}
          </DescriptionList>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No audit chain data available.</p>
        )}
      </div>

      <Divider />

      {/* Retention */}
      <div>
        <div className="flex items-center justify-between">
          <Subheading>Retention Policy</Subheading>
          <Button onClick={() => { setRetentionValue(JSON.stringify(retention || {}, null, 2)); setShowRetentionDialog(true) }}>
            Edit
          </Button>
        </div>
        {retention && typeof retention === 'object' ? (
          <DescriptionList className="mt-3">
            {Object.entries(retention).map(([key, value]) => (
              <div key={key}>
                <DescriptionTerm>{key}</DescriptionTerm>
                <DescriptionDetails>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</DescriptionDetails>
              </div>
            ))}
          </DescriptionList>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No retention policy configured.</p>
        )}
      </div>

      <Divider />

      {/* Alert Webhooks */}
      <div>
        <div className="flex items-center justify-between">
          <Subheading>Alert Webhooks</Subheading>
          <Button onClick={() => { setWebhookUrl(''); setWebhookEvents(''); setWebhookSecret(''); setShowWebhookDialog(true) }}>
            Add Webhook
          </Button>
        </div>
        {webhooks.length > 0 ? (
          <Table className="mt-3 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>URL</TableHeader>
                <TableHeader>Events</TableHeader>
                <TableHeader>Created</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {webhooks.map((wh, idx) => (
                <TableRow key={wh.id || idx}>
                  <TableCell className="font-mono text-xs max-w-xs truncate">{wh.url || '--'}</TableCell>
                  <TableCell>{Array.isArray(wh.events) ? wh.events.join(', ') : wh.events || '--'}</TableCell>
                  <TableCell className="text-zinc-500">{formatDate(wh.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No webhooks configured.</p>
        )}
      </div>

      <Divider />

      {/* Compliance Reports */}
      <div>
        <div className="flex items-center justify-between">
          <Subheading>Compliance Reports</Subheading>
          <Button onClick={() => { setReportResult(null); setShowReportDialog(true) }}>Generate Report</Button>
        </div>
      </div>

      {/* Webhook Dialog */}
      <Dialog open={showWebhookDialog} onClose={() => setShowWebhookDialog(false)} size="sm">
        <DialogTitle>Add Webhook</DialogTitle>
        <DialogBody>
          <div className="space-y-4">
            <Field><Label>URL</Label><Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://..." /></Field>
            <Field><Label>Events (comma-separated)</Label><Input value={webhookEvents} onChange={(e) => setWebhookEvents(e.target.value)} placeholder="approval.created, escalation.triggered" /></Field>
            <Field><Label>Secret (optional)</Label><Input type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} /></Field>
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowWebhookDialog(false)}>Cancel</Button>
          <Button disabled={webhookSaving || !webhookUrl.trim()} onClick={handleSaveWebhook}>
            {webhookSaving ? 'Saving...' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Report Dialog */}
      <Dialog open={showReportDialog} onClose={() => setShowReportDialog(false)} size="sm">
        <DialogTitle>Generate Compliance Report</DialogTitle>
        <DialogBody>
          <div className="space-y-4">
            <Field><Label>From</Label><Input type="datetime-local" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} /></Field>
            <Field><Label>To</Label><Input type="datetime-local" value={reportTo} onChange={(e) => setReportTo(e.target.value)} /></Field>
            {reportResult && (
              <pre className="overflow-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs dark:bg-zinc-800">
                {JSON.stringify(reportResult, null, 2)}
              </pre>
            )}
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowReportDialog(false)}>Close</Button>
          <Button disabled={reportLoading} onClick={handleGenerateReport}>
            {reportLoading ? 'Generating...' : 'Generate'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Retention Dialog */}
      <Dialog open={showRetentionDialog} onClose={() => setShowRetentionDialog(false)} size="sm">
        <DialogTitle>Edit Retention Policy</DialogTitle>
        <DialogBody>
          <Field>
            <Label>Retention Policy (JSON)</Label>
            <Textarea rows={5} value={retentionValue} onChange={(e) => setRetentionValue(e.target.value)} className="font-mono text-xs" />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowRetentionDialog(false)}>Cancel</Button>
          <Button disabled={retentionSaving} onClick={handleSaveRetention}>
            {retentionSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
