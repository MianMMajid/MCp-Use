'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogBody, DialogActions } from '@/components/dialog'
import { Divider } from '@/components/divider'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Subheading } from '@/components/heading'
import { Field, Label } from '@/components/fieldset'
import { DescriptionList, DescriptionTerm, DescriptionDetails } from '@/components/description-list'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, postJson, getCached } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'
import { SkeletonRows } from '@/components/skeleton'

export default function AuditTab() {
  const _cs = getCached('/api/observability/orchestrations/summary')
  const _ca = getCached('/api/observability/orchestrations/audit-log')

  const [summary, setSummary] = useState(_cs || null)
  const [auditLog, setAuditLog] = useState(() => {
    if (!_ca) return []
    return Array.isArray(_ca) ? _ca : Array.isArray(_ca?.events) ? _ca.events : Array.isArray(_ca?.log) ? _ca.log : []
  })
  const [slo, setSlo] = useState(null)
  const [sloWindow, setSloWindow] = useState('1h')
  const [loading, setLoading] = useState(!_cs && !_ca)
  const [error, setError] = useState('')

  // Export dialog
  const [showExport, setShowExport] = useState(false)
  const [exportFormat, setExportFormat] = useState('json')
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const [exportLoading, setExportLoading] = useState(false)
  const [exportResult, setExportResult] = useState(null)

  // Filter
  const [actionFilter, setActionFilter] = useState('all')

  async function fetchAll(window = '1h') {
    setLoading(true)
    try {
      const [summaryData, sloData, auditData] = await Promise.all([
        loadJson('/api/observability/orchestrations/summary'),
        loadJson(`/api/observability/orchestrations/slo?window=${window}`),
        loadJson('/api/observability/orchestrations/audit-log'),
      ])
      setSummary(summaryData)
      setSlo(sloData)
      const events = Array.isArray(auditData) ? auditData
        : Array.isArray(auditData?.events) ? auditData.events
        : Array.isArray(auditData?.log) ? auditData.log : []
      setAuditLog(events)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll(sloWindow) }, [])

  function handleWindowChange(w) {
    setSloWindow(w)
    loadJson(`/api/observability/orchestrations/slo?window=${w}`)
      .then(setSlo)
      .catch(() => {})
  }

  async function handleExport() {
    setExportLoading(true)
    setExportResult(null)
    try {
      const res = await postJson('/api/observability/orchestrations/siem-export', {
        format: exportFormat,
        from: exportFrom || undefined,
        to: exportTo || undefined,
      })
      const data = await res.json().catch(() => ({}))
      setExportResult(data)
    } catch {
      setExportResult({ error: 'Export failed' })
    } finally {
      setExportLoading(false)
    }
  }

  const filteredLog = actionFilter === 'all'
    ? auditLog
    : auditLog.filter((evt) => (evt.action || evt.type || '').toLowerCase().includes(actionFilter))

  return (
    <div className="mt-4 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <Subheading>Audit & Observability</Subheading>
        <div className="flex gap-2">
          <Button onClick={() => setShowExport(true)}>Export</Button>
          <Button onClick={() => fetchAll(sloWindow)}>Refresh</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{error}</p>
        </div>
      )}

      {loading && <SkeletonRows />}

      {/* Summary Cards */}
      {summary && typeof summary === 'object' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(summary).map(([key, value]) => (
            <div key={key} className="rounded-2xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500">{key}</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white">
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* SLO Metrics */}
      {slo && (
        <div>
          <div className="flex items-center gap-3">
            <Subheading>SLO Metrics</Subheading>
            <Select value={sloWindow} onChange={(e) => handleWindowChange(e.target.value)} className="w-24">
              <option value="1h">1h</option>
              <option value="6h">6h</option>
              <option value="24h">24h</option>
            </Select>
          </div>
          <DescriptionList className="mt-3">
            {Object.entries(slo).map(([key, value]) => (
              <div key={key}>
                <DescriptionTerm>{key}</DescriptionTerm>
                <DescriptionDetails>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</DescriptionDetails>
              </div>
            ))}
          </DescriptionList>
        </div>
      )}

      <Divider />

      {/* Audit Log */}
      <div>
        <div className="flex items-center gap-3">
          <Subheading>Audit Log</Subheading>
          <Field className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Filter:</Label>
            <Input
              value={actionFilter === 'all' ? '' : actionFilter}
              onChange={(e) => setActionFilter(e.target.value || 'all')}
              placeholder="Action type..."
              className="w-40"
            />
          </Field>
        </div>
        {filteredLog.length > 0 ? (
          <Table className="mt-3 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Timestamp</TableHeader>
                <TableHeader>Action</TableHeader>
                <TableHeader>Actor</TableHeader>
                <TableHeader>Details</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredLog.map((evt, idx) => (
                <TableRow key={evt.id || idx}>
                  <TableCell className="text-zinc-500">{formatDate(evt.timestamp || evt.createdAt || evt.at)}</TableCell>
                  <TableCell><Badge color={statusColor(evt.action || evt.type)}>{evt.action || evt.type || 'event'}</Badge></TableCell>
                  <TableCell>{evt.actor || evt.user || '--'}</TableCell>
                  <TableCell className="max-w-xs truncate text-zinc-500">{evt.details || evt.message || '--'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          !loading && <p className="mt-3 text-sm text-zinc-500">No audit events found.</p>
        )}
      </div>

      {/* Export Dialog */}
      <Dialog open={showExport} onClose={() => setShowExport(false)} size="sm">
        <DialogTitle>Export Audit Data</DialogTitle>
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
            <Field>
              <Label>From</Label>
              <Input type="datetime-local" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
            </Field>
            <Field>
              <Label>To</Label>
              <Input type="datetime-local" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
            </Field>
            {exportResult && (
              <pre className="overflow-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs dark:bg-zinc-800">
                {JSON.stringify(exportResult, null, 2)}
              </pre>
            )}
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowExport(false)}>Close</Button>
          <Button disabled={exportLoading} onClick={handleExport}>
            {exportLoading ? 'Exporting...' : 'Export'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
