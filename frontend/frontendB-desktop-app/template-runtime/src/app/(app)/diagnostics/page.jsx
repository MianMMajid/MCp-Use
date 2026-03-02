'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Select } from '@/components/select'
import { DescriptionList, DescriptionTerm, DescriptionDetails } from '@/components/description-list'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, getCached } from '@/lib/api'
import { SkeletonRows } from '@/components/skeleton'

export default function DiagnosticsPage() {
  const _cd = getCached('/api/runtime/diag')
  const _cst = getCached('/api/runtime/status')
  const _cdp = getCached('/api/runtime/dependencies')
  const _clg = getCached('/api/runtime/logs?limit=50')
  const _ch = getCached('/health')
  const _cf = getCached('/api/runtime/feature-capabilities')
  const _cae = getCached('/api/audit/events')
  const _hasCached = !!(_cd || _cst || _cdp || _clg || _ch || _cf || _cae)
  const [diag, setDiag] = useState(_cd || null)
  const [status, setStatus] = useState(_cst || null)
  const [deps, setDeps] = useState(() => _cdp ? (Array.isArray(_cdp?.dependencies) ? _cdp.dependencies : Array.isArray(_cdp) ? _cdp : []) : null)
  const [logs, setLogs] = useState(() => _clg ? (_clg?.logs || _clg?.lines || (typeof _clg === 'string' ? _clg : null)) : null)
  const [health, setHealth] = useState(_ch || null)
  const [featureCaps, setFeatureCaps] = useState(_cf || null)
  const [auditEvents, setAuditEvents] = useState(() => _cae ? (Array.isArray(_cae?.events) ? _cae.events : Array.isArray(_cae) ? _cae : null) : null)
  const [loading, setLoading] = useState(!_hasCached)
  const [error, setError] = useState('')
  const [logLimit, setLogLimit] = useState('50')

  function fetchAll(limit) {
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const [diagData, statusData, depsData, logsData, healthData, featureData, auditData] = await Promise.all([
          loadJson('/api/runtime/diag').catch(() => null),
          loadJson('/api/runtime/status').catch(() => null),
          loadJson('/api/runtime/dependencies').catch(() => null),
          loadJson(`/api/runtime/logs?limit=${limit || logLimit}`).catch(() => null),
          loadJson('/health').catch(() => null),
          loadJson('/api/runtime/feature-capabilities').catch(() => null),
          loadJson('/api/audit/events').catch(() => null),
        ])
        if (cancelled) return
        setDiag(diagData)
        setStatus(statusData)
        setDeps(Array.isArray(depsData?.dependencies) ? depsData.dependencies : Array.isArray(depsData) ? depsData : [])
        setLogs(logsData?.logs || logsData?.lines || (typeof logsData === 'string' ? logsData : null))
        setHealth(healthData)
        setFeatureCaps(featureData)
        setAuditEvents(Array.isArray(auditData?.events) ? auditData.events : Array.isArray(auditData) ? auditData : null)
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

  function handleLimitChange(e) {
    const val = e.target.value
    setLogLimit(val)
    fetchAll(val)
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Runtime Diagnostics</Heading>
        <Button className="-my-0.5" onClick={() => fetchAll()}>Refresh</Button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">The gateway may be starting up or temporarily unavailable.</p>
        </div>
      )}

      {loading && <SkeletonRows />}

      {/* Health Check */}
      {!loading && health && (
        <>
          <div className="mt-6 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Health</p>
              <Badge color={health.status === 'ok' || health.status === 'healthy' ? 'green' : 'red'}>
                {health.status || 'unknown'}
              </Badge>
            </div>
            {health.version && <p className="mt-1 text-xs text-zinc-500">Version: {health.version}</p>}
          </div>
        </>
      )}

      {/* Feature Capabilities */}
      {!loading && featureCaps && (
        <>
          <Divider className="my-6" />
          <Subheading>Feature Capabilities</Subheading>
          <pre className="mt-4 overflow-auto rounded-2xl border border-zinc-950/10 bg-zinc-50 p-4 text-xs text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
            {JSON.stringify(featureCaps, null, 2)}
          </pre>
        </>
      )}

      {/* Stats Cards */}
      {!loading && diag && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Uptime</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">{diag.uptime || '--'}</p>
            </div>
            <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Memory</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">{diag.memory || diag.memoryUsage || '--'}</p>
            </div>
            <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Node Version</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">{diag.nodeVersion || diag.node || '--'}</p>
            </div>
          </div>
        </>
      )}

      {/* Dependencies Table */}
      {!loading && deps && deps.length > 0 && (
        <>
          <Divider className="my-6" />
          <Subheading>Dependencies</Subheading>
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
                <TableHeader>Version</TableHeader>
                <TableHeader>Status</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {deps.map((dep, idx) => (
                <TableRow key={dep.name || idx}>
                  <TableCell className="font-medium">{dep.name || '--'}</TableCell>
                  <TableCell>{dep.version || '--'}</TableCell>
                  <TableCell>
                    <Badge color={dep.ok || dep.healthy ? 'green' : 'red'}>
                      {dep.ok || dep.healthy ? 'OK' : 'Error'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {/* Runtime Status */}
      {!loading && status && (
        <>
          <Divider className="my-6" />
          <Subheading>Runtime Status</Subheading>
          <DescriptionList className="mt-4">
            {Object.entries(status).map(([key, val]) => (
              <div key={key}>
                <DescriptionTerm>{key}</DescriptionTerm>
                <DescriptionDetails>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</DescriptionDetails>
              </div>
            ))}
          </DescriptionList>
        </>
      )}

      {/* Audit Events */}
      {!loading && auditEvents && auditEvents.length > 0 && (
        <>
          <Divider className="my-6" />
          <Subheading>Audit Events</Subheading>
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Event</TableHeader>
                <TableHeader>Actor</TableHeader>
                <TableHeader>Timestamp</TableHeader>
                <TableHeader>Details</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {auditEvents.slice(0, 50).map((evt, idx) => (
                <TableRow key={evt.id || idx}>
                  <TableCell className="font-medium">{evt.action || evt.event || evt.type || '--'}</TableCell>
                  <TableCell>{evt.actor || evt.user || evt.userId || '--'}</TableCell>
                  <TableCell className="text-zinc-500">
                    {evt.timestamp || evt.createdAt ? new Date(evt.timestamp || evt.createdAt).toLocaleString() : '--'}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-zinc-500">
                    {evt.details || evt.description || (evt.metadata ? JSON.stringify(evt.metadata) : '--')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {/* Log Viewer */}
      {!loading && (
        <>
          <Divider className="my-6" />
          <div className="flex items-center justify-between">
            <Subheading>Logs</Subheading>
            <Select value={logLimit} onChange={handleLimitChange} className="w-24">
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </Select>
          </div>
          <pre className="mt-4 max-h-96 overflow-auto rounded-2xl border border-zinc-950/10 bg-zinc-50 p-4 font-mono text-xs text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
            {logs || 'No logs available'}
          </pre>
        </>
      )}
    </>
  )
}
