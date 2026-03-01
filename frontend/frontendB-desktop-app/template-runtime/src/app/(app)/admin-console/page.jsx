'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Heading, Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Input } from '@/components/input'
import { Textarea } from '@/components/textarea'
import { Field, Label } from '@/components/fieldset'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, postJson } from '@/lib/api'

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
  if (v === 'active' || v === 'approved' || v === 'success' || v === 'pass') return 'green'
  if (v === 'failed' || v === 'error' || v === 'denied' || v === 'blocked') return 'red'
  if (v === 'pending' || v === 'draft') return 'orange'
  return 'zinc'
}

export default function AdminConsolePage() {
  const [policies, setPolicies] = useState(null)
  const [versions, setVersions] = useState(null)
  const [audit, setAudit] = useState(null)
  const [auditSchemas, setAuditSchemas] = useState(null)
  const [complianceReports, setComplianceReports] = useState(null)
  const [approvals, setApprovals] = useState(null)
  const [deadLetter, setDeadLetter] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  // Validate dialog
  const [showValidate, setShowValidate] = useState(false)
  const [validatePayload, setValidatePayload] = useState('')
  const [validateResult, setValidateResult] = useState(null)
  const [validateLoading, setValidateLoading] = useState(false)

  // Export dialog
  const [showExport, setShowExport] = useState(false)
  const [exportPayload, setExportPayload] = useState('')
  const [exportLoading, setExportLoading] = useState(false)

  // Decision dialog
  const [showDecision, setShowDecision] = useState(false)
  const [decisionPayload, setDecisionPayload] = useState('')
  const [decisionLoading, setDecisionLoading] = useState(false)

  function fetchAll() {
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const [policiesData, versionsData, auditData, schemasData, reportsData, approvalsData, dlData] = await Promise.all([
          loadJson('/admin/api/policies').catch(() => null),
          loadJson('/admin/api/policies/versions').catch(() => null),
          loadJson('/admin/api/audit').catch(() => null),
          loadJson('/admin/api/audit/schemas').catch(() => null),
          loadJson('/admin/api/compliance/reports').catch(() => null),
          loadJson('/admin/api/approvals').catch(() => null),
          loadJson('/admin/api/audit/dead-letter').catch(() => null),
        ])
        if (cancelled) return
        setPolicies(policiesData)
        setVersions(Array.isArray(versionsData?.versions) ? versionsData.versions : Array.isArray(versionsData) ? versionsData : [])
        setAudit(Array.isArray(auditData?.events) ? auditData.events : Array.isArray(auditData?.entries) ? auditData.entries : Array.isArray(auditData) ? auditData : [])
        setAuditSchemas(schemasData)
        setComplianceReports(Array.isArray(reportsData?.reports) ? reportsData.reports : Array.isArray(reportsData) ? reportsData : [])
        setApprovals(Array.isArray(approvalsData?.approvals) ? approvalsData.approvals : Array.isArray(approvalsData) ? approvalsData : [])
        setDeadLetter(Array.isArray(dlData?.events) ? dlData.events : Array.isArray(dlData) ? dlData : [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }

  useEffect(() => {
    const cancel = fetchAll()

    // SSE live updates for approvals
    let es
    try {
      es = new EventSource('/admin/api/approvals/watch')
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.approvals) {
            setApprovals(Array.isArray(data.approvals) ? data.approvals : [])
          } else if (data.type === 'update') {
            fetchAll()
          }
        } catch { /* ignore */ }
      }
      es.onerror = () => { /* reconnect handled by EventSource */ }
    } catch { /* SSE not available */ }

    return () => {
      cancel()
      if (es) es.close()
    }
  }, [])

  async function handleActivateVersion(versionId) {
    try {
      const res = await postJson(`/admin/api/policies/versions/${versionId}/activate`, {})
      if (res.ok) { setMessage('Version activated.'); setMessageType('success'); fetchAll() }
      else { setMessage('Activation failed.'); setMessageType('error') }
    } catch { setMessage('Activation failed.'); setMessageType('error') }
  }

  async function handleValidate() {
    setValidateLoading(true)
    setValidateResult(null)
    try {
      let body = {}
      if (validatePayload.trim()) { try { body = JSON.parse(validatePayload) } catch { body = { raw: validatePayload } } }
      const res = await postJson('/admin/api/policies/validate', body)
      const data = await res.json().catch(() => ({}))
      setValidateResult(data)
    } catch {
      setValidateResult({ error: 'Validation failed' })
    } finally { setValidateLoading(false) }
  }

  async function handleReload() {
    try {
      const res = await postJson('/admin/api/policies/reload', {})
      if (res.ok) { setMessage('Policies reloaded.'); setMessageType('success'); fetchAll() }
      else { setMessage('Reload failed.'); setMessageType('error') }
    } catch { setMessage('Reload failed.'); setMessageType('error') }
  }

  async function handleExport() {
    setExportLoading(true)
    try {
      let body = {}
      if (exportPayload.trim()) { try { body = JSON.parse(exportPayload) } catch { body = { raw: exportPayload } } }
      const res = await postJson('/admin/api/audit/export', body)
      if (res.ok) { setMessage('Audit export initiated.'); setMessageType('success'); setShowExport(false) }
      else { setMessage('Export failed.'); setMessageType('error') }
    } catch { setMessage('Export failed.'); setMessageType('error') }
    finally { setExportLoading(false) }
  }

  async function handleDecision() {
    setDecisionLoading(true)
    try {
      let body = {}
      if (decisionPayload.trim()) { try { body = JSON.parse(decisionPayload) } catch { body = { raw: decisionPayload } } }
      const res = await postJson('/admin/api/approvals/decision', body)
      if (res.ok) { setMessage('Decision submitted.'); setMessageType('success'); setShowDecision(false); fetchAll() }
      else { setMessage('Decision failed.'); setMessageType('error') }
    } catch { setMessage('Decision failed.'); setMessageType('error') }
    finally { setDecisionLoading(false) }
  }

  async function handleReplayDeadLetter(eventId) {
    try {
      const res = await postJson(`/admin/api/audit/dead-letter/${eventId}/replay`, {})
      if (res.ok) { setMessage('Event replayed.'); setMessageType('success'); fetchAll() }
      else { setMessage('Replay failed.'); setMessageType('error') }
    } catch { setMessage('Replay failed.'); setMessageType('error') }
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Admin Console</Heading>
        <Button className="-my-0.5" onClick={() => fetchAll()}>Refresh</Button>
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

      {/* Policies */}
      {!loading && (
        <>
          <Divider className="my-6" />
          <div className="flex items-center justify-between">
            <Subheading>Policies</Subheading>
            <div className="flex gap-2">
              <Button onClick={() => { setShowValidate(true); setValidatePayload(''); setValidateResult(null) }}>Validate</Button>
              <Button onClick={handleReload}>Reload</Button>
            </div>
          </div>
          {policies && (
            <pre className="mt-4 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-800">{JSON.stringify(policies, null, 2)}</pre>
          )}
        </>
      )}

      {/* Policy Versions */}
      {!loading && versions && versions.length > 0 && (
        <>
          <Divider className="my-6" />
          <Subheading>Policy Versions</Subheading>
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Version</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Created</TableHeader>
                <TableHeader className="text-right">Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {versions.map((v, idx) => {
                const vId = v.versionId || v.id || `v-${idx}`
                return (
                  <TableRow key={vId}>
                    <TableCell className="font-mono text-xs">{typeof vId === 'string' ? vId.substring(0, 16) : String(vId)}</TableCell>
                    <TableCell><Badge color={statusColor(v.status)}>{v.status || 'draft'}</Badge></TableCell>
                    <TableCell className="text-zinc-500">{formatDate(v.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button onClick={() => handleActivateVersion(vId)}>Activate</Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </>
      )}

      {/* Audit Events */}
      {!loading && (
        <>
          <Divider className="my-6" />
          <div className="flex items-center justify-between">
            <Subheading>Audit Events</Subheading>
            <Button onClick={() => { setShowExport(true); setExportPayload('') }}>Export</Button>
          </div>
          {audit && audit.length > 0 ? (
            <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
              <TableHead>
                <TableRow>
                  <TableHeader>Time</TableHeader>
                  <TableHeader>Action</TableHeader>
                  <TableHeader>Actor</TableHeader>
                  <TableHeader>Status</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {audit.slice(0, 50).map((evt, idx) => (
                  <TableRow key={evt.id || idx}>
                    <TableCell className="text-zinc-500">{formatDate(evt.timestamp || evt.createdAt)}</TableCell>
                    <TableCell>{evt.action || evt.type || '--'}</TableCell>
                    <TableCell>{evt.actor || evt.user || '--'}</TableCell>
                    <TableCell><Badge color={statusColor(evt.status)}>{evt.status || '--'}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No audit events</p>
            </div>
          )}
        </>
      )}

      {/* Audit Schemas */}
      {!loading && auditSchemas && (
        <>
          <Divider className="my-6" />
          <Subheading>Audit Schemas</Subheading>
          <pre className="mt-4 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-800">{JSON.stringify(auditSchemas, null, 2)}</pre>
        </>
      )}

      {/* Compliance Reports */}
      {!loading && (
        <>
          <Divider className="my-6" />
          <Subheading>Compliance Reports</Subheading>
          {complianceReports && complianceReports.length > 0 ? (
            <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
              <TableHead>
                <TableRow>
                  <TableHeader>Report</TableHeader>
                  <TableHeader>Type</TableHeader>
                  <TableHeader>Generated</TableHeader>
                  <TableHeader>Status</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {complianceReports.map((r, idx) => (
                  <TableRow key={r.id || idx}>
                    <TableCell className="font-medium">{r.name || r.title || r.id || `Report ${idx + 1}`}</TableCell>
                    <TableCell>{r.type || '--'}</TableCell>
                    <TableCell className="text-zinc-500">{formatDate(r.generatedAt || r.createdAt)}</TableCell>
                    <TableCell><Badge color={statusColor(r.status)}>{r.status || '--'}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No compliance reports</p>
            </div>
          )}
        </>
      )}

      {/* Approvals */}
      {!loading && (
        <>
          <Divider className="my-6" />
          <div className="flex items-center justify-between">
            <Subheading>Admin Approvals</Subheading>
            <Button onClick={() => { setShowDecision(true); setDecisionPayload('') }}>Submit Decision</Button>
          </div>
          {approvals && approvals.length > 0 ? (
            <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
              <TableHead>
                <TableRow>
                  <TableHeader>ID</TableHeader>
                  <TableHeader>Action</TableHeader>
                  <TableHeader>Requested</TableHeader>
                  <TableHeader>Status</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {approvals.map((a, idx) => {
                  const aId = a.approvalId || a.id || `approval-${idx}`
                  return (
                    <TableRow key={aId}>
                      <TableCell className="font-mono text-xs">{typeof aId === 'string' ? aId.substring(0, 12) : String(aId)}</TableCell>
                      <TableCell>{a.action || a.type || '--'}</TableCell>
                      <TableCell className="text-zinc-500">{formatDate(a.requestedAt || a.createdAt)}</TableCell>
                      <TableCell><Badge color={statusColor(a.status || a.decision)}>{a.status || a.decision || 'pending'}</Badge></TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No admin approvals</p>
            </div>
          )}
        </>
      )}

      {/* Dead Letter Queue */}
      {!loading && (
        <>
          <Divider className="my-6" />
          <Subheading>Dead Letter Queue</Subheading>
          {deadLetter && deadLetter.length > 0 ? (
            <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
              <TableHead>
                <TableRow>
                  <TableHeader>Event ID</TableHeader>
                  <TableHeader>Type</TableHeader>
                  <TableHeader>Failed At</TableHeader>
                  <TableHeader>Error</TableHeader>
                  <TableHeader className="text-right">Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {deadLetter.map((evt, idx) => {
                  const eId = evt.eventId || evt.id || `dl-${idx}`
                  return (
                    <TableRow key={eId}>
                      <TableCell className="font-mono text-xs">{typeof eId === 'string' ? eId.substring(0, 12) : String(eId)}</TableCell>
                      <TableCell>{evt.type || evt.action || '--'}</TableCell>
                      <TableCell className="text-zinc-500">{formatDate(evt.failedAt || evt.timestamp)}</TableCell>
                      <TableCell className="text-xs text-red-600 dark:text-red-400">{evt.error || evt.reason || '--'}</TableCell>
                      <TableCell className="text-right">
                        <Button onClick={() => handleReplayDeadLetter(eId)}>Replay</Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No dead letter events</p>
            </div>
          )}
        </>
      )}

      {/* Validate Policy Dialog */}
      <Dialog open={showValidate} onClose={() => setShowValidate(false)} size="sm">
        <DialogTitle>Validate Policy</DialogTitle>
        <DialogDescription>Submit a policy definition to validate.</DialogDescription>
        <DialogBody>
          <div className="space-y-4">
            <Field><Label>Policy (JSON)</Label><Textarea rows={6} value={validatePayload} onChange={(e) => setValidatePayload(e.target.value)} placeholder='{"rules": [...]}' /></Field>
            {validateResult && (
              <pre className="overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-800">{JSON.stringify(validateResult, null, 2)}</pre>
            )}
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowValidate(false)}>Close</Button>
          <Button disabled={validateLoading} onClick={handleValidate}>{validateLoading ? 'Validating...' : 'Validate'}</Button>
        </DialogActions>
      </Dialog>

      {/* Export Audit Dialog */}
      <Dialog open={showExport} onClose={() => setShowExport(false)} size="sm">
        <DialogTitle>Export Audit</DialogTitle>
        <DialogDescription>Export audit events with optional filters.</DialogDescription>
        <DialogBody>
          <Field><Label>Export Config (JSON)</Label><Textarea rows={4} value={exportPayload} onChange={(e) => setExportPayload(e.target.value)} placeholder='{"format": "csv", "from": "2024-01-01"}' /></Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowExport(false)}>Cancel</Button>
          <Button disabled={exportLoading} onClick={handleExport}>{exportLoading ? 'Exporting...' : 'Export'}</Button>
        </DialogActions>
      </Dialog>

      {/* Submit Decision Dialog */}
      <Dialog open={showDecision} onClose={() => setShowDecision(false)} size="sm">
        <DialogTitle>Submit Approval Decision</DialogTitle>
        <DialogDescription>Approve or deny a pending request.</DialogDescription>
        <DialogBody>
          <Field><Label>Decision (JSON)</Label><Textarea rows={4} value={decisionPayload} onChange={(e) => setDecisionPayload(e.target.value)} placeholder='{"approvalId": "...", "decision": "approve"}' /></Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowDecision(false)}>Cancel</Button>
          <Button disabled={decisionLoading} onClick={handleDecision}>{decisionLoading ? 'Submitting...' : 'Submit'}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
