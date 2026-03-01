'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Sessions', id: 'demo-sessions' },
  { title: 'Quick actions', id: 'quick-actions' },
  { title: 'Community actions', id: 'community-actions' },
  { title: 'Result', id: 'result' },
]

async function loadJson(path) {
  const res = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

async function postJson(path, body) {
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

function formatDate(d) {
  if (!d) return '--'
  try { return new Date(d).toLocaleString() } catch { return d }
}

export default function DemoPage() {
  const [sessions, setSessions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionResult, setActionResult] = useState(null)
  const [actionLoading, setActionLoading] = useState('')
  const [message, setMessage] = useState('')

  const [ingestPayload, setIngestPayload] = useState('')
  const [forkSessionId, setForkSessionId] = useState('')
  const [sharePayload, setSharePayload] = useState('')
  const [suggestPayload, setSuggestPayload] = useState('')
  const [eventPayload, setEventPayload] = useState('')

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadJson('/api/demo/sessions')
      setSessions(Array.isArray(data?.sessions) ? data.sessions : Array.isArray(data) ? data : [])
    } catch (err) { setError(err.message); setSessions([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  async function quickAction(endpoint, body, label) {
    setActionLoading(label)
    setActionResult(null)
    try {
      const data = await postJson(endpoint, body || {})
      setActionResult({ label, ...data })
      setMessage(`${label} completed.`)
    } catch (err) {
      setActionResult({ error: err.message })
      setMessage(`${label} failed.`)
    } finally { setActionLoading('') }
  }

  function parsePayload(raw) {
    if (!raw.trim()) return {}
    try { return JSON.parse(raw) } catch { return { raw } }
  }

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Demo Playground</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Run demo flows, test guardrails, and interact with the platform.</p>
            </div>
            <Button variant="filled" onClick={fetchSessions}>Refresh</Button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
            </div>
          )}
          {message && <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300">{message}</p>}

          {/* Sessions */}
          <section id="demo-sessions" className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Sessions</h2>
            {!loading && sessions && sessions.length > 0 ? (
              <div className="mt-4 space-y-2">
                {sessions.map((s, idx) => (
                  <div key={s.sessionId || s.id || idx} className="flex items-center justify-between rounded-xl border border-zinc-950/10 bg-white px-4 py-2 dark:border-white/10 dark:bg-zinc-900">
                    <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{(s.sessionId || s.id || '').toString().substring(0, 12)}</span>
                    <Tag color={s.status === 'active' ? 'orange' : 'zinc'} variant="small">{s.status || '--'}</Tag>
                    <span className="text-xs text-zinc-500">{formatDate(s.createdAt)}</span>
                  </div>
                ))}
              </div>
            ) : !loading ? (
              <p className="mt-4 text-sm text-zinc-500">No demo sessions.</p>
            ) : null}
          </section>

          {/* Quick Actions */}
          <section id="quick-actions" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Quick actions</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: 'Start', endpoint: '/api/demo/start' },
                { label: 'Full Flow', endpoint: '/api/demo/full' },
                { label: 'Sync', endpoint: '/api/demo/sync' },
                { label: 'Guard', endpoint: '/api/demo/guard' },
                { label: 'Block', endpoint: '/api/demo/block' },
                { label: 'Audit', endpoint: '/api/demo/audit' },
                { label: 'ML', endpoint: '/api/demo/ml' },
              ].map((a) => (
                <div key={a.label} className="rounded-2xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                  <span className="text-sm font-semibold text-zinc-950 dark:text-white">{a.label}</span>
                  <Button className="mt-2 w-full" variant="filled" disabled={actionLoading === a.label} onClick={() => quickAction(a.endpoint, {}, a.label)}>
                    {actionLoading === a.label ? 'Running...' : `Run ${a.label}`}
                  </Button>
                </div>
              ))}

              {/* Fork */}
              <div className="rounded-2xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <span className="text-sm font-semibold text-zinc-950 dark:text-white">Fork</span>
                <input className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-1 text-sm dark:border-white/10 dark:bg-zinc-800 dark:text-white" value={forkSessionId} onChange={(e) => setForkSessionId(e.target.value)} placeholder="Session ID" />
                <Button className="mt-2 w-full" variant="filled" disabled={actionLoading === 'Fork'} onClick={() => quickAction('/api/demo/fork', { sessionId: forkSessionId }, 'Fork')}>
                  {actionLoading === 'Fork' ? 'Forking...' : 'Fork'}
                </Button>
              </div>

              {/* Ingest */}
              <div className="rounded-2xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <span className="text-sm font-semibold text-zinc-950 dark:text-white">Ingest</span>
                <textarea className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-1 font-mono text-xs dark:border-white/10 dark:bg-zinc-800 dark:text-white" rows={2} value={ingestPayload} onChange={(e) => setIngestPayload(e.target.value)} placeholder='{"data": ...}' />
                <Button className="mt-2 w-full" variant="filled" disabled={actionLoading === 'Ingest'} onClick={() => quickAction('/api/demo/ingest', parsePayload(ingestPayload), 'Ingest')}>
                  {actionLoading === 'Ingest' ? 'Ingesting...' : 'Ingest'}
                </Button>
              </div>
            </div>
          </section>

          {/* Community Actions */}
          <section id="community-actions" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Community actions</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <span className="text-sm font-semibold text-zinc-950 dark:text-white">Share</span>
                <textarea className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-1 font-mono text-xs dark:border-white/10 dark:bg-zinc-800 dark:text-white" rows={2} value={sharePayload} onChange={(e) => setSharePayload(e.target.value)} placeholder='{"traceId": "..."}' />
                <Button className="mt-2 w-full" variant="filled" disabled={actionLoading === 'Share'} onClick={() => quickAction('/api/demo/share', parsePayload(sharePayload), 'Share')}>
                  {actionLoading === 'Share' ? 'Sharing...' : 'Share'}
                </Button>
              </div>
              <div className="rounded-2xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <span className="text-sm font-semibold text-zinc-950 dark:text-white">Suggest</span>
                <textarea className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-1 font-mono text-xs dark:border-white/10 dark:bg-zinc-800 dark:text-white" rows={2} value={suggestPayload} onChange={(e) => setSuggestPayload(e.target.value)} placeholder='{"suggestion": "..."}' />
                <Button className="mt-2 w-full" variant="filled" disabled={actionLoading === 'Suggest'} onClick={() => quickAction('/api/demo/suggest', parsePayload(suggestPayload), 'Suggest')}>
                  {actionLoading === 'Suggest' ? 'Submitting...' : 'Suggest'}
                </Button>
              </div>
              <div className="rounded-2xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <span className="text-sm font-semibold text-zinc-950 dark:text-white">Brief</span>
                <Button className="mt-2 w-full" variant="filled" disabled={actionLoading === 'Brief'} onClick={() => quickAction('/api/demo/brief', {}, 'Brief')}>
                  {actionLoading === 'Brief' ? 'Generating...' : 'Get Brief'}
                </Button>
              </div>
              <div className="rounded-2xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <span className="text-sm font-semibold text-zinc-950 dark:text-white">Post Event</span>
                <textarea className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-1 font-mono text-xs dark:border-white/10 dark:bg-zinc-800 dark:text-white" rows={2} value={eventPayload} onChange={(e) => setEventPayload(e.target.value)} placeholder='{"type": "...", "data": {}}' />
                <Button className="mt-2 w-full" variant="filled" disabled={actionLoading === 'Event'} onClick={() => quickAction('/api/openclaw/events', parsePayload(eventPayload), 'Event')}>
                  {actionLoading === 'Event' ? 'Posting...' : 'Post Event'}
                </Button>
              </div>
            </div>
          </section>

          {/* Result */}
          {actionResult && (
            <section id="result" className="mt-10">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Result</h2>
              <div className="mt-4 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                <pre className="max-h-64 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(actionResult, null, 2)}</pre>
              </div>
            </section>
          )}
        </div>
      </div>
    </article>
  )
}
