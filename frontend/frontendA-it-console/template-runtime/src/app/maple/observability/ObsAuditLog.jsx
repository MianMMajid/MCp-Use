'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadJson, postJson } from '@/lib/api'
import { Button } from '@/components/Button'
import { SkeletonList } from '@/components/Skeleton'

export default function ObsAuditLog() {
  const [auditLog, setAuditLog] = useState(null)
  const [auditLogLoading, setAuditLogLoading] = useState(true)
  const [auditLogCursor, setAuditLogCursor] = useState(null)
  const [siemFormat, setSiemFormat] = useState('json')
  const [siemMsg, setSiemMsg] = useState(null)
  const [siemExporting, setSiemExporting] = useState(false)
  const [flushing, setFlushing] = useState(false)

  const fetchData = useCallback(async () => {
    setAuditLogLoading(true)
    try {
      const data = await loadJson('/api/openclaw/modifier/observability/audit-log')
      setAuditLog(Array.isArray(data) ? data : data.entries ?? data.events ?? data.items ?? [])
      setAuditLogCursor(data.nextCursor ?? data.cursor ?? null)
    } catch { /* non-critical */ }
    finally { setAuditLogLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!siemMsg) return
    const t = setTimeout(() => setSiemMsg(null), 5000)
    return () => clearTimeout(t)
  }, [siemMsg])

  async function loadMoreAuditLog() {
    if (!auditLogCursor) return
    setAuditLogLoading(true)
    try {
      const data = await loadJson(`/api/openclaw/modifier/observability/audit-log?cursor=${auditLogCursor}`)
      const entries = Array.isArray(data) ? data : data.entries ?? data.events ?? data.items ?? []
      setAuditLog((prev) => (prev ? [...prev, ...entries] : entries))
      setAuditLogCursor(data.nextCursor ?? data.cursor ?? null)
    } catch { /* non-critical */ }
    finally { setAuditLogLoading(false) }
  }

  async function handleSiemExport() {
    setSiemExporting(true)
    setSiemMsg(null)
    try {
      const result = await postJson('/api/openclaw/modifier/observability/siem-export', { format: siemFormat })
      setSiemMsg(result.message ?? result.status ?? 'SIEM export triggered.')
    } catch (err) { setSiemMsg(`Export failed: ${err.message}`) }
    finally { setSiemExporting(false) }
  }

  async function handleFlush() {
    setFlushing(true)
    setSiemMsg(null)
    try {
      const result = await postJson('/api/openclaw/modifier/observability/flush', {})
      setSiemMsg(result.message ?? result.status ?? 'Outbox flushed.')
    } catch (err) { setSiemMsg(`Flush failed: ${err.message}`) }
    finally { setFlushing(false) }
  }

  return (
    <>
      <section id="audit-log" className="mt-10">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Audit Log</h2>

        {auditLogLoading && !auditLog ? (
          <div className="mt-4"><SkeletonList /></div>
        ) : auditLog && auditLog.length > 0 ? (
          <>
            <div className="mt-4 overflow-auto rounded-2xl border border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900">
              <table className="min-w-[600px] w-full text-left text-sm">
                <thead>
                  <tr className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-950/5 dark:border-white/5">
                    <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Event</th>
                    <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Actor</th>
                    <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-950/5 dark:divide-white/5">
                  {auditLog.map((entry, idx) => (
                    <tr key={entry.id ?? idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-4 py-2 font-medium text-zinc-950 dark:text-white">{entry.event ?? entry.type ?? entry.action ?? `Entry ${idx + 1}`}</td>
                      <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{entry.actor ?? '-'}</td>
                      <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {auditLogCursor && (
              <div className="mt-4 flex justify-center">
                <Button variant="secondary" onClick={loadMoreAuditLog} disabled={auditLogLoading}>{auditLogLoading ? 'Loading...' : 'Load more'}</Button>
              </div>
            )}
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No audit log entries.</p>
          </div>
        )}
      </section>

      <section id="siem" className="mt-10">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">SIEM Export</h2>
        <div className="mt-4 flex items-center gap-3">
          <select value={siemFormat} onChange={(e) => setSiemFormat(e.target.value)} className="rounded-lg border border-zinc-950/10 bg-white px-3 py-1.5 text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white">
            <option value="json">JSON</option>
            <option value="cef">CEF</option>
            <option value="syslog">Syslog</option>
          </select>
          <Button variant="filled" onClick={handleSiemExport} disabled={siemExporting}>{siemExporting ? 'Exporting...' : 'Export to SIEM'}</Button>
          <Button variant="secondary" onClick={handleFlush} disabled={flushing}>{flushing ? 'Flushing...' : 'Flush Outbox'}</Button>
        </div>
        {siemMsg && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{siemMsg}</p>}
      </section>
    </>
  )
}
