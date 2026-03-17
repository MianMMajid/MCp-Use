'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Agent status', id: 'agent-status' },
  { title: 'Chat', id: 'agent-chat' },
  { title: 'Sessions', id: 'sessions' },
]

/* ------------------------------------------------------------------ */
/*  Fetch helpers                                                      */
/* ------------------------------------------------------------------ */

async function loadJson(path) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

/* ------------------------------------------------------------------ */
/*  Skeletons                                                          */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 h-8 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
            <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="mt-2 h-3 w-56 rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDate(d) {
  if (!d) return '--'
  try { return new Date(d).toLocaleString() } catch { return d }
}

function scanColor(scan) {
  const verdict = String(scan?.verdict || '').toLowerCase()
  if (scan?.status === 'pending') return 'amber'
  if (verdict === 'malicious') return 'rose'
  if (verdict === 'quarantined') return 'amber'
  return 'orange'
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AgentManagementPage() {
  const [status, setStatus] = useState(null)
  const [sessions, setSessions] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [detail, setDetail] = useState(null)
  const [artifacts, setArtifacts] = useState(null)
  const [artifactsRunId, setArtifactsRunId] = useState('')

  // Chat state
  const [mode, setMode] = useState('turn')
  const [chatInput, setChatInput] = useState('')
  const [chatReply, setChatReply] = useState(null)
  const [chatSending, setChatSending] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [statusRes, sessionsRes] = await Promise.allSettled([
        loadJson('/api/openclaw/agent/status'),
        loadJson('/api/openclaw/agent/sessions'),
      ])
      if (statusRes.status === 'fulfilled') setStatus(statusRes.value)
      if (sessionsRes.status === 'fulfilled') {
        const d = sessionsRes.value
        setSessions(Array.isArray(d?.sessions) ? d.sessions : Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [])
        setCursor(d?.nextCursor || null)
      }
      if (statusRes.status === 'rejected' && sessionsRes.status === 'rejected') {
        throw new Error('All endpoints failed')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleCancel(sessionId) {
    try {
      await postJson(`/api/openclaw/agent/sessions/${sessionId}/cancel`, {})
      fetchData()
    } catch (err) {
      setError(`Cancel failed: ${err.message}`)
    }
  }

  async function toggleExpand(sessionId) {
    if (expanded === sessionId) { setExpanded(null); setDetail(null); setArtifacts(null); setArtifactsRunId(''); return }
    setExpanded(sessionId)
    try {
      const d = await loadJson(`/api/openclaw/agent/sessions/${sessionId}`)
      setDetail(d)
    } catch { setDetail(null) }
  }

  async function loadArtifacts(runId) {
    try {
      const d = await loadJson(`/api/openclaw/agent/runs/${runId}/artifacts`)
      setArtifactsRunId(d?.runId || runId || '')
      setArtifacts(Array.isArray(d?.artifacts) ? d.artifacts : Array.isArray(d) ? d : [])
    } catch { setArtifacts([]) }
  }

  async function loadMore() {
    if (!cursor) return
    try {
      const d = await loadJson(`/api/openclaw/agent/sessions?cursor=${cursor}`)
      const items = Array.isArray(d?.sessions) ? d.sessions : Array.isArray(d?.items) ? d.items : []
      setSessions((prev) => [...(prev || []), ...items])
      setCursor(d?.nextCursor || null)
    } catch { /* ignore */ }
  }

  async function handleChat() {
    if (!chatInput.trim()) return
    setChatSending(true)
    setChatReply(null)
    try {
      const endpoint = mode === 'longform' ? '/api/openclaw/agent/longform' : '/api/openclaw/agent/turn'
      const body = mode === 'longform' ? { objective: chatInput } : { message: chatInput }
      const data = await postJson(endpoint, body)
      setChatReply(data)
    } catch (err) {
      setChatReply({ error: err.message })
    } finally {
      setChatSending(false)
    }
  }

  const agentStatus = status?.status || status?.state || 'unknown'

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
                Agent Management
              </h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Monitor agent status, manage sessions, and interact with the agent.
              </p>
            </div>
            <Button variant="filled" onClick={fetchData}>Refresh</Button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">The gateway may be starting up or temporarily unavailable.</p>
            </div>
          )}

          {/* Agent Status */}
          <section id="agent-status" className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Agent status</h2>
            {loading ? (
              <div className="mt-4"><SkeletonCard /></div>
            ) : status ? (
              <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${agentStatus === 'online' || agentStatus === 'ready' || agentStatus === 'active' ? 'bg-orange-500' : 'bg-zinc-400'}`} />
                  <Tag color={agentStatus === 'online' || agentStatus === 'ready' || agentStatus === 'active' ? 'orange' : 'zinc'} variant="medium">{agentStatus.toUpperCase()}</Tag>
                </div>
                <pre className="mt-3 overflow-auto text-xs text-zinc-600 dark:text-zinc-400">{JSON.stringify(status, null, 2)}</pre>
              </div>
            ) : (
              <p className="mt-4 text-sm text-zinc-500">No agent status available.</p>
            )}
          </section>

          {/* Agent Chat */}
          <section id="agent-chat" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Chat</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Send a single-turn message or a longform objective.</p>
            <div className="mt-4 flex gap-2">
              <Button variant={mode === 'turn' ? 'filled' : 'secondary'} onClick={() => setMode('turn')}>Single Turn</Button>
              <Button variant={mode === 'longform' ? 'filled' : 'secondary'} onClick={() => setMode('longform')}>Longform</Button>
            </div>
            <div className="mt-4">
              <textarea
                className="w-full rounded-xl border border-zinc-950/10 bg-white px-4 py-3 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                rows={mode === 'longform' ? 5 : 2}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={mode === 'longform' ? 'Describe your objective...' : 'Type a message...'}
              />
              <div className="mt-3">
                <Button variant="filled" onClick={handleChat} disabled={chatSending || !chatInput.trim()}>
                  {chatSending ? 'Sending...' : 'Submit'}
                </Button>
              </div>
              {chatReply && (
                <div className="mt-4 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                  <pre className="max-h-48 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(chatReply, null, 2)}</pre>
                </div>
              )}
            </div>
          </section>

          {/* Sessions */}
          <section id="sessions" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Sessions</h2>
            {loading ? (
              <div className="mt-4"><SkeletonList /></div>
            ) : sessions && sessions.length > 0 ? (
              <div className="mt-4 space-y-3">
                {sessions.map((session) => {
                  const sid = session.sessionId || session.id || ''
                  const shortId = typeof sid === 'string' ? sid.substring(0, 12) : String(sid)
                  const st = session.status || 'unknown'
                  const isActive = st === 'running' || st === 'in_progress' || st === 'active'
                  return (
                    <div key={sid} className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => toggleExpand(sid)} className="font-mono text-sm font-medium text-zinc-950 hover:underline dark:text-white">{shortId}</button>
                          <Tag color={isActive ? 'orange' : st === 'completed' || st === 'success' ? 'orange' : st === 'failed' || st === 'error' ? 'rose' : 'zinc'} variant="medium">{st}</Tag>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500">{formatDate(session.startedAt || session.createdAt)}</span>
                          {isActive && (
                            <Button variant="secondary" onClick={() => handleCancel(sid)}>Cancel</Button>
                          )}
                          {session.runId && (
                            <Button variant="secondary" onClick={() => loadArtifacts(session.runId)}>Artifacts</Button>
                          )}
                        </div>
                      </div>
                      {session.agentName && <p className="mt-1 text-xs text-zinc-500">Agent: {session.agentName || session.agent}</p>}
                      {expanded === sid && detail && (
                        <pre className="mt-3 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{JSON.stringify(detail, null, 2)}</pre>
                      )}
                    </div>
                  )
                })}
                {cursor && (
                  <div className="text-center">
                    <Button variant="secondary" onClick={loadMore}>Load More</Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No agent sessions found.</p>
              </div>
            )}
            {artifacts && (
              <div className="mt-4 rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">Artifacts</h3>
                <div className="mt-3 space-y-3">
                  {artifacts.map((artifact, index) => (
                    <div key={`${artifact.artifactType || 'artifact'}-${index}`} className="rounded-xl border border-zinc-950/10 p-3 dark:border-white/10">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-zinc-950 dark:text-white">{artifact.artifactType || `Artifact ${index + 1}`}</span>
                        {artifact.scan && (
                          <>
                            <Tag color={scanColor(artifact.scan)} variant="medium">{String(artifact.scan.verdict || artifact.scan.status || 'unknown')}</Tag>
                            <Tag color="zinc" variant="small">{String(artifact.scan.provider || 'local')}</Tag>
                          </>
                        )}
                      </div>
                      {artifact.scan && (
                        <div className="mt-2 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                          <p>status={artifact.scan.status} blocked={String(Boolean(artifact.scan.blocked))} quarantined={String(Boolean(artifact.scan.quarantined))}</p>
                          <p>sha256={artifact.scan.sha256} size={artifact.scan.sizeBytes} contentType={artifact.scan.contentType}</p>
                          {Array.isArray(artifact.scan.reasons) && artifact.scan.reasons.length > 0 && (
                            <p>reasons: {artifact.scan.reasons.join(' | ')}</p>
                          )}
                          {(artifactsRunId || detail?.session?.sessionId) && (
                            <p>
                              <a
                                className="underline"
                                href={`/maple/cyber?runId=${encodeURIComponent(artifactsRunId || '')}&sessionId=${encodeURIComponent(detail?.session?.sessionId || '')}`}
                              >
                                Open in Cyber Operations
                              </a>
                            </p>
                          )}
                        </div>
                      )}
                      <pre className="mt-3 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{JSON.stringify(artifact, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
