'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Divider } from '@/components/divider'
import { Heading } from '@/components/heading'
import { Input, InputGroup } from '@/components/input'
import { Link } from '@/components/link'
import { Select } from '@/components/select'
import { MagnifyingGlassIcon } from '@heroicons/react/16/solid'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Field, Label } from '@/components/fieldset'
import { loadJson, postJson, invalidateCache } from '@/lib/api'
import { formatDate, statusColor, severityColor } from '@/lib/format'
import { SkeletonGrid } from '@/components/skeleton'

export default function Events() {
  const [traces, setTraces] = useState(null)
  const [count, setCount] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('date')
  const [showExport, setShowExport] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [showClear, setShowClear] = useState(false)
  const [clearLoading, setClearLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  function fetchTraces(query) {
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        let data
        if (query) {
          data = await loadJson(`/api/traces/search?q=${encodeURIComponent(query)}`)
        } else {
          data = await loadJson('/api/traces')
        }
        if (cancelled) return
        setTraces(Array.isArray(data?.traces) ? data.traces : [])
        setCount(data?.count ?? 0)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setTraces([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }

  useEffect(() => {
    return fetchTraces()
  }, [])

  function handleServerSearch() {
    if (search.trim()) {
      fetchTraces(search.trim())
    } else {
      fetchTraces()
    }
  }

  async function handleExport() {
    setExportLoading(true)
    try {
      const res = await postJson('/api/traces/export', { query: search || undefined })
      if (res.ok) { invalidateCache('/api/traces'); setMessage('Export initiated.'); setMessageType('success') }
      else { setMessage('Export failed.'); setMessageType('error') }
    } catch { setMessage('Export failed.'); setMessageType('error') }
    finally { setExportLoading(false); setShowExport(false) }
  }

  async function handleClear() {
    setClearLoading(true)
    try {
      const res = await postJson('/api/traces/clear', {})
      if (res.ok) { invalidateCache('/api/traces'); setMessage('All traces cleared.'); setMessageType('success'); fetchTraces() }
      else { setMessage('Clear failed.'); setMessageType('error') }
    } catch { setMessage('Clear failed.'); setMessageType('error') }
    finally { setClearLoading(false); setShowClear(false) }
  }

  const filtered = (traces || [])
    .filter((t) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        (t.name || '').toLowerCase().includes(q) ||
        (t.agent || '').toLowerCase().includes(q) ||
        (t.toolName || '').toLowerCase().includes(q) ||
        (t.traceId || t.id || '').toString().toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '')
      if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '')
      // default: sort by date descending
      const dateA = new Date(a.startedAt || a.createdAt || 0).getTime()
      const dateB = new Date(b.startedAt || b.createdAt || 0).getTime()
      return dateB - dateA
    })

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-sm:w-full sm:flex-1">
          <Heading>Agents</Heading>
          <div className="mt-4 flex max-w-xl gap-4">
            <div className="flex-1">
              <InputGroup>
                <MagnifyingGlassIcon />
                <Input
                  name="search"
                  placeholder="Search tools or agents&hellip;"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleServerSearch() }}
                />
              </InputGroup>
            </div>
            <div>
              <Select name="sort_by" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="date">Sort by updated</option>
                <option value="name">Sort by name</option>
                <option value="status">Sort by status</option>
              </Select>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowExport(true)}>Export</Button>
          <Button color="red" onClick={() => setShowClear(true)}>Clear All</Button>
          <Button href="/orders">Review approvals</Button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            The gateway may be starting up or temporarily unavailable. Try refreshing the page.
          </p>
        </div>
      )}

      {loading && <SkeletonGrid />}

      {!loading && filtered.length === 0 && !error && (
        <div className="mt-10 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {search ? 'No matching traces found' : 'No agent traces yet'}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {search
              ? 'Try adjusting your search query.'
              : 'When agents execute runs, their traces will appear here.'}
          </p>
        </div>
      )}

      {message && (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${messageType === 'success' ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'}`}>
          {message}
        </p>
      )}

      {!loading && filtered.length > 0 && (
        <>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {count} trace{count !== 1 ? 's' : ''} total
            {search && ` \u00b7 ${filtered.length} matching`}
          </p>
          <ul className="mt-6">
            {filtered.map((trace, index) => {
              const traceId = trace.traceId || trace.id || `trace-${index}`
              const traceStatus = trace.status || 'unknown'
              const severity = trace.severity || trace.risk?.severity || null

              return (
                <li key={traceId}>
                  <Divider soft={index > 0} />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-6 py-6">
                      <div className="space-y-1.5">
                        <div className="text-base/6 font-semibold">
                          <Link href={`/events/${traceId}`}>
                            {trace.name || trace.toolName || trace.agent || `Trace ${typeof traceId === 'string' ? traceId.substring(0, 12) : traceId}`}
                          </Link>
                        </div>
                        <div className="text-xs/6 text-zinc-500">
                          {formatDate(trace.startedAt || trace.createdAt)}
                          {trace.agent && (
                            <>
                              {' '}
                              <span aria-hidden="true">&middot;</span> {trace.agent}
                            </>
                          )}
                          {trace.duration && (
                            <>
                              {' '}
                              <span aria-hidden="true">&middot;</span> {trace.duration}
                            </>
                          )}
                        </div>
                        <div className="text-xs/6 text-zinc-600 dark:text-zinc-400">
                          {trace.toolName && <>Tool: {trace.toolName}</>}
                          {trace.stepsCount != null && (
                            <>
                              {trace.toolName ? ' \u00b7 ' : ''}
                              {trace.stepsCount} step{trace.stepsCount !== 1 ? 's' : ''}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {severity && (
                        <Badge className="max-sm:hidden" color={severityColor(severity)}>
                          {severity}
                        </Badge>
                      )}
                      <Badge color={statusColor(traceStatus)}>{traceStatus}</Badge>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {/* Export Dialog */}
      <Dialog open={showExport} onClose={() => setShowExport(false)} size="sm">
        <DialogTitle>Export Traces</DialogTitle>
        <DialogDescription>Export all traces{search ? ` matching "${search}"` : ''}.</DialogDescription>
        <DialogBody />
        <DialogActions>
          <Button plain onClick={() => setShowExport(false)}>Cancel</Button>
          <Button disabled={exportLoading} onClick={handleExport}>{exportLoading ? 'Exporting...' : 'Export'}</Button>
        </DialogActions>
      </Dialog>

      {/* Clear Dialog */}
      <Dialog open={showClear} onClose={() => setShowClear(false)} size="sm">
        <DialogTitle>Clear All Traces</DialogTitle>
        <DialogDescription>This will permanently delete all traces. This action cannot be undone.</DialogDescription>
        <DialogBody />
        <DialogActions>
          <Button plain onClick={() => setShowClear(false)}>Cancel</Button>
          <Button color="red" disabled={clearLoading} onClick={handleClear}>{clearLoading ? 'Clearing...' : 'Clear All'}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
