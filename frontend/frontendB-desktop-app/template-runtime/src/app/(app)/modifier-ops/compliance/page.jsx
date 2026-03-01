'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Heading, Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Input } from '@/components/input'
import { Textarea } from '@/components/textarea'
import { Select } from '@/components/select'
import { Field, Label } from '@/components/fieldset'
import { Link } from '@/components/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, postJson, deleteJson } from '@/lib/api'

function SkeletonRows() {
  return (
    <div className="mt-8 animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded bg-zinc-100 dark:bg-zinc-800" />
        ))}
      </div>
    </div>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return '--'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return dateStr }
}

function statusColor(s) {
  if (!s) return 'zinc'
  const v = s.toLowerCase()
  if (v === 'active' || v === 'valid' || v === 'success' || v === 'compliant') return 'green'
  if (v === 'expired' || v === 'failed' || v === 'error' || v === 'revoked') return 'red'
  if (v === 'pending' || v === 'review') return 'orange'
  return 'zinc'
}

export default function ModifierOpsCompliancePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  // Break-glass state
  const [breakGlassLog, setBreakGlassLog] = useState(null)

  // Audit chain state
  const [auditEvents, setAuditEvents] = useState(null)
  const [verifyResult, setVerifyResult] = useState(null)

  // Retention state
  const [retentionConfig, setRetentionConfig] = useState(null)
  const [retentionPayload, setRetentionPayload] = useState('')

  // Alert webhooks state
  const [webhooks, setWebhooks] = useState(null)
  const [expandedWebhook, setExpandedWebhook] = useState(null)
  const [deliveries, setDeliveries] = useState(null)

  // Compliance state
  const [complianceSummary, setComplianceSummary] = useState(null)

  // Break-glass execute dialog
  const [showExecute, setShowExecute] = useState(false)
  const [executePayload, setExecutePayload] = useState('')
  const [executeLoading, setExecuteLoading] = useState(false)

  // Break-glass review dialog
  const [showReview, setShowReview] = useState(false)
  const [reviewId, setReviewId] = useState('')
  const [reviewAction, setReviewAction] = useState('approve')
  const [reviewLoading, setReviewLoading] = useState(false)

  // Register webhook dialog
  const [showRegisterWebhook, setShowRegisterWebhook] = useState(false)
  const [webhookPayload, setWebhookPayload] = useState('')
  const [webhookLoading, setWebhookLoading] = useState(false)

  // Generate report dialog
  const [showReport, setShowReport] = useState(false)
  const [reportFormat, setReportFormat] = useState('json')
  const [reportLoading, setReportLoading] = useState(false)
  const [reportResult, setReportResult] = useState(null)

  function fetchAll() {
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const [bgData, auditData, retData, whData, compData] = await Promise.all([
          loadJson('/api/openclaw/modifier/ops/break-glass').catch(() => null),
          loadJson('/api/openclaw/modifier/ops/audit-chain/events').catch(() => null),
          loadJson('/api/openclaw/modifier/ops/retention').catch(() => null),
          loadJson('/api/openclaw/modifier/ops/alert-webhooks').catch(() => null),
          loadJson('/api/openclaw/modifier/ops/compliance/summary').catch(() => null),
        ])
        if (cancelled) return
        setBreakGlassLog(Array.isArray(bgData?.entries) ? bgData.entries : Array.isArray(bgData) ? bgData : [])
        setAuditEvents(Array.isArray(auditData?.events) ? auditData.events : Array.isArray(auditData) ? auditData : [])
        setRetentionConfig(retData)
        setWebhooks(Array.isArray(whData?.webhooks) ? whData.webhooks : Array.isArray(whData) ? whData : [])
        setComplianceSummary(compData)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }

  useEffect(() => {
    return fetchAll()
  }, [])

  async function handleBreakGlassExecute() {
    setExecuteLoading(true)
    try {
      let body = {}
      if (executePayload.trim()) { try { body = JSON.parse(executePayload) } catch { body = { raw: executePayload } } }
      const res = await postJson('/api/openclaw/modifier/ops/break-glass/execute', body)
      if (res.ok) { setMessage('Break-glass executed.'); setMessageType('success'); setShowExecute(false); fetchAll() }
      else { setMessage('Break-glass execution failed.'); setMessageType('error') }
    } catch { setMessage('Break-glass execution failed.'); setMessageType('error') }
    finally { setExecuteLoading(false) }
  }

  async function handleBreakGlassReview() {
    setReviewLoading(true)
    try {
      const res = await postJson(`/api/openclaw/modifier/ops/break-glass/${reviewId}/review`, { action: reviewAction })
      if (res.ok) { setMessage('Review submitted.'); setMessageType('success'); setShowReview(false); fetchAll() }
      else { setMessage('Review failed.'); setMessageType('error') }
    } catch { setMessage('Review failed.'); setMessageType('error') }
    finally { setReviewLoading(false) }
  }

  async function handleVerifyChain() {
    try {
      const res = await postJson('/api/openclaw/modifier/ops/audit-chain/verify', {})
      const data = await res.json().catch(() => ({}))
      setVerifyResult(data)
      setMessage(data.valid ? 'Chain verified.' : 'Chain verification failed.')
      setMessageType(data.valid ? 'success' : 'error')
    } catch { setMessage('Verification failed.'); setMessageType('error') }
  }

  async function handleRetentionUpdate() {
    try {
      let body = {}
      if (retentionPayload.trim()) { try { body = JSON.parse(retentionPayload) } catch { body = { raw: retentionPayload } } }
      const res = await postJson('/api/openclaw/modifier/ops/retention', body)
      if (res.ok) { setMessage('Retention updated.'); setMessageType('success'); fetchAll() }
      else { setMessage('Retention update failed.'); setMessageType('error') }
    } catch { setMessage('Retention update failed.'); setMessageType('error') }
  }

  async function handleRetentionEnforce() {
    try {
      const res = await postJson('/api/openclaw/modifier/ops/retention/enforce', {})
      if (res.ok) { setMessage('Retention enforced.'); setMessageType('success') }
      else { setMessage('Enforcement failed.'); setMessageType('error') }
    } catch { setMessage('Enforcement failed.'); setMessageType('error') }
  }

  async function handleRegisterWebhook() {
    setWebhookLoading(true)
    try {
      let body = {}
      if (webhookPayload.trim()) { try { body = JSON.parse(webhookPayload) } catch { body = { raw: webhookPayload } } }
      const res = await postJson('/api/openclaw/modifier/ops/alert-webhooks', body)
      if (res.ok) { setMessage('Webhook registered.'); setMessageType('success'); setShowRegisterWebhook(false); fetchAll() }
      else { setMessage('Registration failed.'); setMessageType('error') }
    } catch { setMessage('Registration failed.'); setMessageType('error') }
    finally { setWebhookLoading(false) }
  }

  async function handleDeleteWebhook(whId) {
    try {
      await deleteJson(`/api/openclaw/modifier/ops/alert-webhooks/${whId}`)
      setMessage('Webhook deleted.'); setMessageType('success')
      fetchAll()
    } catch { setMessage('Failed to delete webhook.'); setMessageType('error') }
  }

  async function toggleWebhookDeliveries(whId) {
    if (expandedWebhook === whId) { setExpandedWebhook(null); setDeliveries(null); return }
    setExpandedWebhook(whId)
    try {
      const data = await loadJson(`/api/openclaw/modifier/ops/alert-webhooks/${whId}/deliveries`)
      setDeliveries(Array.isArray(data?.deliveries) ? data.deliveries : Array.isArray(data) ? data : [])
    } catch { setDeliveries([]) }
  }

  async function handleGenerateReport() {
    setReportLoading(true)
    setReportResult(null)
    try {
      const res = await postJson('/api/openclaw/modifier/ops/compliance/report', { format: reportFormat })
      const data = await res.json().catch(() => ({}))
      setReportResult(data)
      if (res.ok) { setMessage('Report generated.'); setMessageType('success') }
    } catch { setReportResult({ error: 'Report generation failed' }) }
    finally { setReportLoading(false) }
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Modifier Operations</Heading>
        <Button className="-my-0.5" onClick={() => fetchAll()}>Refresh</Button>
      </div>

      {/* Sub-nav */}
      <div className="mt-4 flex gap-4 text-sm font-medium">
        <Link href="/modifier-ops" className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">Governance</Link>
        <Link href="/modifier-ops/policy" className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">Policy & Escalation</Link>
        <span className="text-zinc-950 dark:text-white">Compliance & Alerts</span>
      </div>

      {message && (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${messageType === 'success' ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'}`}>
          {message}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
        </div>
      )}

      {loading && <SkeletonRows />}

      {/* Break-Glass */}
      {!loading && (
        <>
          <Divider className="my-6" />
          <div className="flex items-center justify-between">
            <Subheading>Break-Glass Access</Subheading>
            <div className="flex gap-2">
              <Button onClick={() => { setShowExecute(true); setExecutePayload('') }}>Execute</Button>
              <Button outline onClick={() => { setShowReview(true); setReviewId(''); setReviewAction('approve') }}>Review</Button>
            </div>
          </div>
          {breakGlassLog && breakGlassLog.length > 0 && (
            <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
              <TableHead>
                <TableRow>
                  <TableHeader>Time</TableHeader>
                  <TableHeader>Actor</TableHeader>
                  <TableHeader>Reason</TableHeader>
                  <TableHeader>Status</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {breakGlassLog.map((entry, idx) => (
                  <TableRow key={entry.id || idx}>
                    <TableCell className="text-zinc-500">{formatDate(entry.timestamp || entry.createdAt)}</TableCell>
                    <TableCell>{entry.actor || entry.user || '--'}</TableCell>
                    <TableCell>{entry.reason || '--'}</TableCell>
                    <TableCell><Badge color={statusColor(entry.status)}>{entry.status || '--'}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {breakGlassLog && breakGlassLog.length === 0 && (
            <p className="mt-4 text-sm text-zinc-500">No break-glass entries.</p>
          )}
        </>
      )}

      {/* Audit Chain */}
      {!loading && (
        <>
          <Divider className="my-6" />
          <div className="flex items-center justify-between">
            <Subheading>Audit Chain</Subheading>
            <Button onClick={handleVerifyChain}>Verify Chain</Button>
          </div>
          {verifyResult && (
            <p className={`mt-2 text-sm ${verifyResult.valid ? 'text-green-600' : 'text-red-600'}`}>
              {verifyResult.valid ? 'Chain integrity verified' : verifyResult.error || 'Chain verification failed'}
            </p>
          )}
          {auditEvents && auditEvents.length > 0 && (
            <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
              <TableHead>
                <TableRow>
                  <TableHeader>Time</TableHeader>
                  <TableHeader>Event</TableHeader>
                  <TableHeader>Hash</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {auditEvents.map((evt, idx) => (
                  <TableRow key={evt.id || idx}>
                    <TableCell className="text-zinc-500">{formatDate(evt.timestamp || evt.createdAt)}</TableCell>
                    <TableCell>{evt.event || evt.type || '--'}</TableCell>
                    <TableCell className="font-mono text-xs">{(evt.hash || '--').substring(0, 16)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}

      {/* Retention */}
      {!loading && (
        <>
          <Divider className="my-6" />
          <Subheading>Retention</Subheading>
          {retentionConfig && (
            <pre className="mt-2 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-800">{JSON.stringify(retentionConfig, null, 2)}</pre>
          )}
          <div className="mt-4 space-y-4">
            <Field><Label>Retention Config (JSON)</Label><Textarea rows={3} value={retentionPayload} onChange={(e) => setRetentionPayload(e.target.value)} placeholder='{"days": 90}' /></Field>
            <div className="flex gap-2">
              <Button onClick={handleRetentionUpdate}>Update</Button>
              <Button color="red" onClick={handleRetentionEnforce}>Enforce</Button>
            </div>
          </div>
        </>
      )}

      {/* Alert Webhooks */}
      {!loading && (
        <>
          <Divider className="my-6" />
          <div className="flex items-center justify-between">
            <Subheading>Alert Webhooks</Subheading>
            <Button onClick={() => { setShowRegisterWebhook(true); setWebhookPayload('') }}>Register Webhook</Button>
          </div>
          {webhooks && webhooks.length > 0 && (
            <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
              <TableHead>
                <TableRow>
                  <TableHeader>URL</TableHeader>
                  <TableHeader>Events</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader className="text-right">Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {webhooks.map((wh) => {
                  const whId = wh.webhookId || wh.id
                  return (
                    <>
                      <TableRow key={whId}>
                        <TableCell className="font-mono text-xs">{wh.url || '--'}</TableCell>
                        <TableCell>{Array.isArray(wh.events) ? wh.events.join(', ') : wh.events || '--'}</TableCell>
                        <TableCell><Badge color={statusColor(wh.status)}>{wh.status || 'active'}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button plain onClick={() => toggleWebhookDeliveries(whId)}>
                              {expandedWebhook === whId ? 'Hide' : 'Deliveries'}
                            </Button>
                            <Button color="red" onClick={() => handleDeleteWebhook(whId)}>Delete</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedWebhook === whId && deliveries && (
                        <TableRow key={`${whId}-deliveries`}>
                          <TableCell colSpan={4}>
                            {deliveries.length === 0 ? (
                              <p className="text-sm text-zinc-500">No deliveries.</p>
                            ) : (
                              <ul className="space-y-1">
                                {deliveries.map((d, i) => (
                                  <li key={i} className="flex items-center gap-2 text-xs">
                                    <Badge color={d.success ? 'green' : 'red'}>{d.statusCode || (d.success ? 'OK' : 'Failed')}</Badge>
                                    <span className="text-zinc-500">{formatDate(d.timestamp || d.deliveredAt)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}

      {/* Compliance */}
      {!loading && complianceSummary && (
        <>
          <Divider className="my-6" />
          <div className="flex items-center justify-between">
            <Subheading>Compliance</Subheading>
            <Button onClick={() => { setShowReport(true); setReportResult(null) }}>Generate Report</Button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(complianceSummary).map(([key, val]) => (
              <div key={key} className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{key}</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
                  {typeof val === 'number' ? val : String(val)}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Break-Glass Execute Dialog */}
      <Dialog open={showExecute} onClose={() => setShowExecute(false)} size="sm">
        <DialogTitle>Execute Break-Glass</DialogTitle>
        <DialogDescription>Provide justification for emergency access.</DialogDescription>
        <DialogBody>
          <Field><Label>Payload (JSON)</Label><Textarea rows={4} value={executePayload} onChange={(e) => setExecutePayload(e.target.value)} placeholder='{"reason": "...", "scope": "..."}' /></Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowExecute(false)}>Cancel</Button>
          <Button color="red" disabled={executeLoading} onClick={handleBreakGlassExecute}>{executeLoading ? 'Executing...' : 'Execute'}</Button>
        </DialogActions>
      </Dialog>

      {/* Break-Glass Review Dialog */}
      <Dialog open={showReview} onClose={() => setShowReview(false)} size="sm">
        <DialogTitle>Review Break-Glass</DialogTitle>
        <DialogDescription>Review a break-glass access request.</DialogDescription>
        <DialogBody>
          <div className="space-y-4">
            <Field><Label>Break-Glass ID</Label><Input value={reviewId} onChange={(e) => setReviewId(e.target.value)} placeholder="Enter ID" /></Field>
            <Field>
              <Label>Action</Label>
              <Select value={reviewAction} onChange={(e) => setReviewAction(e.target.value)}>
                <option value="approve">Approve</option>
                <option value="revoke">Revoke</option>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowReview(false)}>Cancel</Button>
          <Button disabled={reviewLoading || !reviewId} onClick={handleBreakGlassReview}>{reviewLoading ? 'Submitting...' : 'Submit'}</Button>
        </DialogActions>
      </Dialog>

      {/* Register Webhook Dialog */}
      <Dialog open={showRegisterWebhook} onClose={() => setShowRegisterWebhook(false)} size="sm">
        <DialogTitle>Register Alert Webhook</DialogTitle>
        <DialogDescription>Register a new webhook for alert notifications.</DialogDescription>
        <DialogBody>
          <Field><Label>Webhook Config (JSON)</Label><Textarea rows={4} value={webhookPayload} onChange={(e) => setWebhookPayload(e.target.value)} placeholder='{"url": "https://...", "events": ["*"]}' /></Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowRegisterWebhook(false)}>Cancel</Button>
          <Button disabled={webhookLoading} onClick={handleRegisterWebhook}>{webhookLoading ? 'Registering...' : 'Register'}</Button>
        </DialogActions>
      </Dialog>

      {/* Generate Report Dialog */}
      <Dialog open={showReport} onClose={() => setShowReport(false)} size="sm">
        <DialogTitle>Generate Compliance Report</DialogTitle>
        <DialogDescription>Generate a compliance report for audit.</DialogDescription>
        <DialogBody>
          <div className="space-y-4">
            <Field>
              <Label>Format</Label>
              <Select value={reportFormat} onChange={(e) => setReportFormat(e.target.value)}>
                <option value="json">JSON</option>
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
              </Select>
            </Field>
            {reportResult && (
              <pre className="overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-800">{JSON.stringify(reportResult, null, 2)}</pre>
            )}
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowReport(false)}>Close</Button>
          <Button disabled={reportLoading} onClick={handleGenerateReport}>{reportLoading ? 'Generating...' : 'Generate'}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
