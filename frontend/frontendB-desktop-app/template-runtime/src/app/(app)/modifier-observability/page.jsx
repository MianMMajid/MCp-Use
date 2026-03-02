'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Heading, Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Field, Label } from '@/components/fieldset'
import { DescriptionList, DescriptionTerm, DescriptionDetails } from '@/components/description-list'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, postJson, getCached } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { SkeletonRows } from '@/components/skeleton'

export default function ModifierObservabilityPage() {
  const _cs = getCached('/api/openclaw/modifier/observability/summary')
  const _csl = getCached('/api/openclaw/modifier/observability/slo?window=1h')
  const _ca = getCached('/api/openclaw/modifier/observability/audit-log')
  const _co = getCached('/api/openclaw/modifier/observability/org')
  const _hasCached = !!(_cs || _csl || _ca || _co)
  const [summary, setSummary] = useState(_cs || null)
  const [slo, setSlo] = useState(_csl || null)
  const [auditLog, setAuditLog] = useState(() => _ca ? (Array.isArray(_ca?.entries) ? _ca.entries : Array.isArray(_ca?.items) ? _ca.items : Array.isArray(_ca) ? _ca : []) : null)
  const [org, setOrg] = useState(_co || null)
  const [loading, setLoading] = useState(!_hasCached)
  const [error, setError] = useState('')
  const [sloWindow, setSloWindow] = useState('1h')

  // Export Dialog
  const [showExport, setShowExport] = useState(false)
  const [exportFormat, setExportFormat] = useState('json')
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const [exportLoading, setExportLoading] = useState(false)
  const [exportResult, setExportResult] = useState(null)

  // Flush Dialog
  const [showFlush, setShowFlush] = useState(false)
  const [flushLoading, setFlushLoading] = useState(false)

  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  function fetchAll(window) {
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const w = window || sloWindow
        const [summaryData, sloData, auditData, orgData] = await Promise.all([
          loadJson('/api/openclaw/modifier/observability/summary').catch(() => null),
          loadJson(`/api/openclaw/modifier/observability/slo?window=${w}`).catch(() => null),
          loadJson('/api/openclaw/modifier/observability/audit-log').catch(() => null),
          loadJson('/api/openclaw/modifier/observability/org').catch(() => null),
        ])
        if (cancelled) return
        setSummary(summaryData)
        setSlo(sloData)
        setAuditLog(Array.isArray(auditData?.entries) ? auditData.entries : Array.isArray(auditData?.items) ? auditData.items : Array.isArray(auditData) ? auditData : [])
        setOrg(orgData)
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

  function handleWindowChange(e) {
    const val = e.target.value
    setSloWindow(val)
    fetchAll(val)
  }

  async function handleExport() {
    setExportLoading(true)
    setExportResult(null)
    try {
      const res = await postJson('/api/openclaw/modifier/observability/siem-export', {
        format: exportFormat,
        from: exportFrom || undefined,
        to: exportTo || undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setExportResult({ ok: true, ...data })
        setMessage('Export initiated successfully.')
        setMessageType('success')
        setShowExport(false)
      } else {
        setExportResult(data)
      }
    } catch {
      setExportResult({ error: 'Export failed' })
    } finally {
      setExportLoading(false)
    }
  }

  async function handleFlush() {
    setFlushLoading(true)
    try {
      const res = await postJson('/api/openclaw/modifier/observability/flush', {})
      if (res.ok) {
        setMessage('Flush completed successfully.')
        setMessageType('success')
        setShowFlush(false)
        fetchAll()
      } else {
        setMessage('Flush failed.')
        setMessageType('error')
      }
    } catch {
      setMessage('Flush failed.')
      setMessageType('error')
    } finally {
      setFlushLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Modifier Observability</Heading>
        <div className="flex gap-2">
          <Button onClick={() => setShowExport(true)}>Export</Button>
          <Button color="red" onClick={() => setShowFlush(true)}>Flush</Button>
          <Button className="-my-0.5" onClick={() => fetchAll()}>Refresh</Button>
        </div>
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

      {/* Summary Cards */}
      {!loading && summary && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(summary).map(([key, val]) => (
              <div key={key} className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{key}</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
                  {typeof val === 'number' ? val : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* SLO Section */}
      {!loading && slo && (
        <>
          <Divider className="my-6" />
          <div className="flex items-center justify-between">
            <Subheading>SLO Metrics</Subheading>
            <Select value={sloWindow} onChange={handleWindowChange} className="w-24">
              <option value="1h">1h</option>
              <option value="6h">6h</option>
              <option value="24h">24h</option>
            </Select>
          </div>
          <DescriptionList className="mt-4">
            {Object.entries(slo).map(([key, val]) => (
              <div key={key}>
                <DescriptionTerm>{key}</DescriptionTerm>
                <DescriptionDetails>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</DescriptionDetails>
              </div>
            ))}
          </DescriptionList>
        </>
      )}

      {/* Audit Log */}
      {!loading && auditLog && auditLog.length > 0 && (
        <>
          <Divider className="my-6" />
          <Subheading>Audit Log</Subheading>
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Timestamp</TableHeader>
                <TableHeader>Action</TableHeader>
                <TableHeader>Actor</TableHeader>
                <TableHeader>Details</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {auditLog.map((entry, idx) => (
                <TableRow key={entry.id || idx}>
                  <TableCell className="text-zinc-500">{formatDate(entry.timestamp || entry.createdAt)}</TableCell>
                  <TableCell className="font-medium">{entry.action || entry.type || '--'}</TableCell>
                  <TableCell>{entry.actor || entry.user || '--'}</TableCell>
                  <TableCell className="text-xs text-zinc-500">{entry.details || entry.message || '--'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {/* Org Section */}
      {!loading && org && (
        <>
          <Divider className="my-6" />
          <Subheading>Organization</Subheading>
          <DescriptionList className="mt-4">
            {Object.entries(org).map(([key, val]) => (
              <div key={key}>
                <DescriptionTerm>{key}</DescriptionTerm>
                <DescriptionDetails>
                  {Array.isArray(val) ? val.length + ' items' : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                </DescriptionDetails>
              </div>
            ))}
          </DescriptionList>
        </>
      )}

      {/* Export Dialog */}
      <Dialog open={showExport} onClose={() => setShowExport(false)} size="sm">
        <DialogTitle>SIEM Export</DialogTitle>
        <DialogDescription>Export observability data for SIEM integration.</DialogDescription>
        <DialogBody>
          <div className="space-y-4">
            <Field>
              <Label>Format</Label>
              <Select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
                <option value="cef">CEF</option>
              </Select>
            </Field>
            <Field><Label>From (optional)</Label><Input type="datetime-local" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} /></Field>
            <Field><Label>To (optional)</Label><Input type="datetime-local" value={exportTo} onChange={(e) => setExportTo(e.target.value)} /></Field>
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowExport(false)}>Cancel</Button>
          <Button disabled={exportLoading} onClick={handleExport}>{exportLoading ? 'Exporting...' : 'Export'}</Button>
        </DialogActions>
      </Dialog>

      {/* Flush Dialog */}
      <Dialog open={showFlush} onClose={() => setShowFlush(false)} size="sm">
        <DialogTitle>Confirm Flush</DialogTitle>
        <DialogDescription>This will flush all observability buffers. This action cannot be undone.</DialogDescription>
        <DialogBody />
        <DialogActions>
          <Button plain onClick={() => setShowFlush(false)}>Cancel</Button>
          <Button color="red" disabled={flushLoading} onClick={handleFlush}>{flushLoading ? 'Flushing...' : 'Flush'}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
