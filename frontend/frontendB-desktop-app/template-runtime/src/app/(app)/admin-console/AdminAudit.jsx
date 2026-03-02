'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Textarea } from '@/components/textarea'
import { Field, Label } from '@/components/fieldset'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { SkeletonRows } from '@/components/skeleton'
import { loadJson, postJson } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'

export default function AdminAudit() {
  const [audit, setAudit] = useState(null)
  const [auditSchemas, setAuditSchemas] = useState(null)
  const [complianceReports, setComplianceReports] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  // Export dialog
  const [showExport, setShowExport] = useState(false)
  const [exportPayload, setExportPayload] = useState('')
  const [exportLoading, setExportLoading] = useState(false)

  function fetchData() {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [auditData, schemasData, reportsData] = await Promise.all([
          loadJson('/admin/api/audit').catch(() => null),
          loadJson('/admin/api/audit/schemas').catch(() => null),
          loadJson('/admin/api/compliance/reports').catch(() => null),
        ])
        if (cancelled) return
        setAudit(
          Array.isArray(auditData?.events)
            ? auditData.events
            : Array.isArray(auditData?.entries)
              ? auditData.entries
              : Array.isArray(auditData)
                ? auditData
                : [],
        )
        setAuditSchemas(schemasData)
        setComplianceReports(
          Array.isArray(reportsData?.reports)
            ? reportsData.reports
            : Array.isArray(reportsData)
              ? reportsData
              : [],
        )
      } catch {
        /* handled per-call */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }

  useEffect(() => {
    const cancel = fetchData()
    return () => cancel()
  }, [])

  async function handleExport() {
    setExportLoading(true)
    try {
      let body = {}
      if (exportPayload.trim()) {
        try { body = JSON.parse(exportPayload) } catch { body = { raw: exportPayload } }
      }
      const res = await postJson('/admin/api/audit/export', body)
      if (res.ok) { setMessage('Audit export initiated.'); setMessageType('success'); setShowExport(false) }
      else { setMessage('Export failed.'); setMessageType('error') }
    } catch { setMessage('Export failed.'); setMessageType('error') }
    finally { setExportLoading(false) }
  }

  async function handleReload() {
    fetchData()
  }

  if (loading) return <div className="mt-4"><SkeletonRows /></div>

  return (
    <>
      {message && (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${messageType === 'success' ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'}`}>
          {message}
        </p>
      )}

      {/* Audit Events */}
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

      {/* Audit Schemas */}
      {auditSchemas && (
        <>
          <Divider className="my-6" />
          <Subheading>Audit Schemas</Subheading>
          <pre className="mt-4 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-800">
            {JSON.stringify(auditSchemas, null, 2)}
          </pre>
        </>
      )}

      {/* Compliance Reports */}
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

      {/* Export Audit Dialog */}
      <Dialog open={showExport} onClose={() => setShowExport(false)} size="sm">
        <DialogTitle>Export Audit</DialogTitle>
        <DialogDescription>Export audit events with optional filters.</DialogDescription>
        <DialogBody>
          <Field>
            <Label>Export Config (JSON)</Label>
            <Textarea rows={4} value={exportPayload} onChange={(e) => setExportPayload(e.target.value)} placeholder='{"format": "csv", "from": "2024-01-01"}' />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowExport(false)}>Cancel</Button>
          <Button disabled={exportLoading} onClick={handleExport}>{exportLoading ? 'Exporting...' : 'Export'}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
