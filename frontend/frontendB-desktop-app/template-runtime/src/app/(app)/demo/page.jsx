'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Input } from '@/components/input'
import { Textarea } from '@/components/textarea'
import { Field, Label } from '@/components/fieldset'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, postJson } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'
import { SkeletonRows } from '@/components/skeleton'

export default function DemoPage() {
  const [sessions, setSessions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')
  const [actionResult, setActionResult] = useState(null)
  const [actionLoading, setActionLoading] = useState('')

  // Quick action inputs
  const [ingestPayload, setIngestPayload] = useState('')
  const [forkSessionId, setForkSessionId] = useState('')
  const [sharePayload, setSharePayload] = useState('')
  const [suggestPayload, setSuggestPayload] = useState('')
  const [eventPayload, setEventPayload] = useState('')

  function fetchSessions() {
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const data = await loadJson('/api/demo/sessions')
        if (cancelled) return
        setSessions(Array.isArray(data?.sessions) ? data.sessions : Array.isArray(data) ? data : [])
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setSessions([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }

  useEffect(() => {
    return fetchSessions()
  }, [])

  async function quickAction(endpoint, body, label) {
    setActionLoading(label)
    setActionResult(null)
    try {
      const res = await postJson(endpoint, body || {})
      const data = await res.json().catch(() => ({}))
      setActionResult({ label, ...data })
      if (res.ok) { setMessage(`${label} completed.`); setMessageType('success') }
      else { setMessage(`${label} failed.`); setMessageType('error') }
    } catch {
      setActionResult({ error: `${label} failed` })
      setMessage(`${label} failed.`); setMessageType('error')
    } finally {
      setActionLoading('')
    }
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Demo Playground</Heading>
        <Button className="-my-0.5" onClick={() => fetchSessions()}>Refresh</Button>
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

      {/* Sessions Table */}
      {!loading && sessions && sessions.length > 0 && (
        <>
          <Subheading className="mt-6">Demo Sessions</Subheading>
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Session ID</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Created</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {sessions.map((s, idx) => {
                const id = s.sessionId || s.id || `session-${idx}`
                return (
                  <TableRow key={id}>
                    <TableCell className="font-mono text-xs">{typeof id === 'string' ? id.substring(0, 12) : String(id)}</TableCell>
                    <TableCell><Badge color={statusColor(s.status)}>{s.status || '--'}</Badge></TableCell>
                    <TableCell className="text-zinc-500">{formatDate(s.createdAt)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </>
      )}

      {/* Quick Actions */}
      <Divider className="my-6" />
      <Subheading>Quick Actions</Subheading>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Start */}
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Start Demo</p>
          <Button className="mt-3 w-full" disabled={actionLoading === 'Start'} onClick={() => quickAction('/api/demo/start', {}, 'Start')}>
            {actionLoading === 'Start' ? 'Starting...' : 'Start'}
          </Button>
        </div>

        {/* Full Flow */}
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Full Flow</p>
          <Button className="mt-3 w-full" disabled={actionLoading === 'Full Flow'} onClick={() => quickAction('/api/demo/full', {}, 'Full Flow')}>
            {actionLoading === 'Full Flow' ? 'Running...' : 'Run Full Flow'}
          </Button>
        </div>

        {/* Sync */}
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Sync</p>
          <Button className="mt-3 w-full" disabled={actionLoading === 'Sync'} onClick={() => quickAction('/api/demo/sync', {}, 'Sync')}>
            {actionLoading === 'Sync' ? 'Syncing...' : 'Sync'}
          </Button>
        </div>

        {/* Fork */}
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Fork Session</p>
          <Input className="mt-2" value={forkSessionId} onChange={(e) => setForkSessionId(e.target.value)} placeholder="Session ID" />
          <Button className="mt-2 w-full" disabled={actionLoading === 'Fork'} onClick={() => quickAction('/api/demo/fork', { sessionId: forkSessionId }, 'Fork')}>
            {actionLoading === 'Fork' ? 'Forking...' : 'Fork'}
          </Button>
        </div>

        {/* Guard */}
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Guard</p>
          <Button className="mt-3 w-full" disabled={actionLoading === 'Guard'} onClick={() => quickAction('/api/demo/guard', {}, 'Guard')}>
            {actionLoading === 'Guard' ? 'Running...' : 'Test Guard'}
          </Button>
        </div>

        {/* Block */}
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Block</p>
          <Button className="mt-3 w-full" disabled={actionLoading === 'Block'} onClick={() => quickAction('/api/demo/block', {}, 'Block')}>
            {actionLoading === 'Block' ? 'Running...' : 'Test Block'}
          </Button>
        </div>

        {/* Audit */}
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Audit</p>
          <Button className="mt-3 w-full" disabled={actionLoading === 'Audit'} onClick={() => quickAction('/api/demo/audit', {}, 'Audit')}>
            {actionLoading === 'Audit' ? 'Running...' : 'Run Audit'}
          </Button>
        </div>

        {/* Ingest */}
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Ingest</p>
          <Textarea className="mt-2" rows={2} value={ingestPayload} onChange={(e) => setIngestPayload(e.target.value)} placeholder='{"data": ...}' />
          <Button className="mt-2 w-full" disabled={actionLoading === 'Ingest'} onClick={() => {
            let body = {}
            if (ingestPayload.trim()) { try { body = JSON.parse(ingestPayload) } catch { body = { raw: ingestPayload } } }
            quickAction('/api/demo/ingest', body, 'Ingest')
          }}>
            {actionLoading === 'Ingest' ? 'Ingesting...' : 'Ingest'}
          </Button>
        </div>

        {/* ML */}
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">ML Analysis</p>
          <Button className="mt-3 w-full" disabled={actionLoading === 'ML'} onClick={() => quickAction('/api/demo/ml', {}, 'ML')}>
            {actionLoading === 'ML' ? 'Running...' : 'Run ML'}
          </Button>
        </div>
      </div>

      {/* Community Section */}
      <Divider className="my-6" />
      <Subheading>Community</Subheading>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Share */}
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Share</p>
          <Textarea className="mt-2" rows={2} value={sharePayload} onChange={(e) => setSharePayload(e.target.value)} placeholder='{"traceId": "..."}' />
          <Button className="mt-2 w-full" disabled={actionLoading === 'Share'} onClick={() => {
            let body = {}
            if (sharePayload.trim()) { try { body = JSON.parse(sharePayload) } catch { body = { raw: sharePayload } } }
            quickAction('/api/demo/share', body, 'Share')
          }}>
            {actionLoading === 'Share' ? 'Sharing...' : 'Share'}
          </Button>
        </div>

        {/* Suggest */}
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Suggest</p>
          <Textarea className="mt-2" rows={2} value={suggestPayload} onChange={(e) => setSuggestPayload(e.target.value)} placeholder='{"suggestion": "..."}' />
          <Button className="mt-2 w-full" disabled={actionLoading === 'Suggest'} onClick={() => {
            let body = {}
            if (suggestPayload.trim()) { try { body = JSON.parse(suggestPayload) } catch { body = { raw: suggestPayload } } }
            quickAction('/api/demo/suggest', body, 'Suggest')
          }}>
            {actionLoading === 'Suggest' ? 'Submitting...' : 'Suggest'}
          </Button>
        </div>

        {/* Brief */}
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Brief</p>
          <Button className="mt-3 w-full" disabled={actionLoading === 'Brief'} onClick={() => quickAction('/api/demo/brief', {}, 'Brief')}>
            {actionLoading === 'Brief' ? 'Generating...' : 'Get Brief'}
          </Button>
        </div>

        {/* Post Event */}
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Post Event</p>
          <Textarea className="mt-2" rows={2} value={eventPayload} onChange={(e) => setEventPayload(e.target.value)} placeholder='{"type": "...", "data": {}}' />
          <Button className="mt-2 w-full" disabled={actionLoading === 'Event'} onClick={() => {
            let body = {}
            if (eventPayload.trim()) { try { body = JSON.parse(eventPayload) } catch { body = { raw: eventPayload } } }
            quickAction('/api/openclaw/events', body, 'Event')
          }}>
            {actionLoading === 'Event' ? 'Posting...' : 'Post Event'}
          </Button>
        </div>
      </div>

      {/* Action Result */}
      {actionResult && (
        <>
          <Divider className="my-6" />
          <Subheading>Last Result</Subheading>
          <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <pre className="overflow-auto text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(actionResult, null, 2)}</pre>
          </div>
        </>
      )}
    </>
  )
}
