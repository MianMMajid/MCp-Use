'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Status', id: 'status' },
  { title: 'Effective rules', id: 'effective-rules' },
  { title: 'Preview tool', id: 'preview-tool' },
  { title: 'Firewall chat', id: 'firewall-chat' },
  { title: 'Capabilities', id: 'capabilities' },
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
      <div className="mt-2 h-3 w-32 rounded bg-zinc-100 dark:bg-zinc-800" />
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700"
          >
            <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="mt-2 h-3 w-56 rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Status card                                                        */
/* ------------------------------------------------------------------ */

function StatusCard({ label, value, detail, color }) {
  const dotColor =
    color === 'green'
      ? 'bg-emerald-500'
      : color === 'red'
        ? 'bg-rose-500'
        : 'bg-amber-500'

  return (
    <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-zinc-950 dark:text-white">
        {value}
      </p>
      {detail && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {detail}
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function FirewallDashboardPage() {
  const [rules, setRules] = useState(null)
  const [capabilities, setCapabilities] = useState(null)
  const [chatCaps, setChatCaps] = useState(null)
  const [featureCaps, setFeatureCaps] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Preview state
  const [previewInput, setPreviewInput] = useState('')
  const [previewResult, setPreviewResult] = useState(null)
  const [previewing, setPreviewing] = useState(false)

  // Chat state
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const chatEndRef = useRef(null)

  /* -- Data fetch -- */
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [r, cc, fc] = await Promise.allSettled([
        loadJson('/api/firewall/rules/effective'),
        loadJson('/api/chat/capabilities'),
        loadJson('/api/runtime/feature-capabilities'),
      ])

      if (r.status === 'fulfilled') {
        const data = r.value
        setRules(Array.isArray(data) ? data : data.rules ?? [])
      }
      if (cc.status === 'fulfilled') setChatCaps(cc.value)
      if (fc.status === 'fulfilled') {
        const data = fc.value
        setFeatureCaps(
          Array.isArray(data)
            ? data
            : data.capabilities ?? data.features ?? [],
        )
      }

      if (
        r.status === 'rejected' &&
        cc.status === 'rejected' &&
        fc.status === 'rejected'
      ) {
        throw new Error('All endpoints failed')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* -- Preview handler -- */
  async function handlePreview() {
    if (!previewInput.trim()) return
    setPreviewing(true)
    setPreviewResult(null)
    try {
      let body
      try {
        body = JSON.parse(previewInput)
      } catch {
        body = { input: previewInput }
      }
      const result = await postJson('/api/firewall/preview', body)
      setPreviewResult(result)
    } catch (err) {
      setPreviewResult({ error: err.message })
    } finally {
      setPreviewing(false)
    }
  }

  /* -- Chat handler -- */
  async function handleChatSend() {
    if (!chatInput.trim()) return
    const userMsg = { role: 'user', content: chatInput }
    setChatMessages((prev) => [...prev, userMsg])
    setChatInput('')
    setChatSending(true)
    try {
      const result = await postJson('/api/firewall/chat', {
        message: chatInput,
      })
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            result.reply ?? result.message ?? result.response ?? JSON.stringify(result),
        },
      ])
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'error', content: `Error: ${err.message}` },
      ])
    } finally {
      setChatSending(false)
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  /* -- Derived status cards -- */
  const ruleCount = rules ? rules.length : 0
  const enabledCaps = featureCaps
    ? featureCaps.filter((c) => c.enabled !== false).length
    : 0
  const totalCaps = featureCaps ? featureCaps.length : 0

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Firewall Dashboard
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Monitor firewall rules, preview decisions, chat with the firewall,
            and inspect capabilities.
          </p>

          {/* Error banner */}
          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Some data could not be loaded
              </p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                The gateway may be starting up or temporarily unavailable. Try
                refreshing the page.
              </p>
            </div>
          )}

          {/* ---- Status cards (3-col) ---- */}
          <section id="status" className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Status
            </h2>
            {loading ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatusCard
                  label="Effective rules"
                  value={ruleCount}
                  detail={`${ruleCount} rule${ruleCount !== 1 ? 's' : ''} active`}
                  color={ruleCount > 0 ? 'green' : 'red'}
                />
                <StatusCard
                  label="Capabilities"
                  value={`${enabledCaps}/${totalCaps}`}
                  detail={`${enabledCaps} enabled`}
                  color={enabledCaps === totalCaps && totalCaps > 0 ? 'green' : 'amber'}
                />
                <StatusCard
                  label="Chat"
                  value={chatCaps ? 'Available' : 'Unknown'}
                  detail={
                    chatCaps?.models
                      ? `Models: ${chatCaps.models.join(', ')}`
                      : 'Check /api/chat/capabilities'
                  }
                  color={chatCaps ? 'green' : 'amber'}
                />
              </div>
            )}
          </section>

          {/* ---- Effective rules list ---- */}
          <section id="effective-rules" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Effective rules
            </h2>

            {loading ? (
              <div className="mt-4">
                <SkeletonList />
              </div>
            ) : rules && rules.length > 0 ? (
              <div className="mt-4 space-y-3">
                {rules.map((rule, idx) => (
                  <div
                    key={rule.id ?? idx}
                    className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-950 dark:text-white">
                          {rule.name ?? rule.id ?? `Rule ${idx + 1}`}
                        </span>
                        {rule.action && (
                          <Tag
                            color={
                              rule.action === 'allow'
                                ? 'emerald'
                                : rule.action === 'block'
                                  ? 'rose'
                                  : 'amber'
                            }
                            variant="medium"
                          >
                            {rule.action.toUpperCase()}
                          </Tag>
                        )}
                      </div>
                      {rule.priority != null && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          pri {rule.priority}
                        </span>
                      )}
                    </div>
                    {rule.description && (
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {rule.description}
                      </p>
                    )}
                    {rule.pattern && (
                      <p className="mt-1 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                        {rule.pattern}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No effective firewall rules found.
                </p>
              </div>
            )}
          </section>

          {/* ---- Preview tool ---- */}
          <section id="preview-tool" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Preview tool
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Submit a tool call payload to preview the firewall decision without
              executing.
            </p>
            <div className="mt-4">
              <textarea
                className="w-full rounded-xl border border-zinc-950/10 bg-white px-4 py-3 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                rows={4}
                value={previewInput}
                onChange={(e) => setPreviewInput(e.target.value)}
                placeholder='{"tool": "file_read", "args": {"path": "/etc/passwd"}}'
              />
              <div className="mt-3">
                <Button
                  variant="primary"
                  onClick={handlePreview}
                  disabled={previewing || !previewInput.trim()}
                >
                  {previewing ? 'Previewing...' : 'Preview decision'}
                </Button>
              </div>
              {previewResult && (
                <div className="mt-4 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                  {previewResult.error ? (
                    <p className="text-sm text-rose-600 dark:text-rose-400">
                      {previewResult.error}
                    </p>
                  ) : (
                    <pre className="max-h-48 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
                      {JSON.stringify(previewResult, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ---- Firewall chat ---- */}
          <section id="firewall-chat" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Firewall chat
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Ask questions about firewall rules and policies using natural
              language.
            </p>
            <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900">
              {/* Messages */}
              <div className="max-h-80 overflow-y-auto p-4">
                {chatMessages.length === 0 ? (
                  <p className="text-center text-sm text-zinc-400 dark:text-zinc-500">
                    Start a conversation with the firewall assistant.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${
                            msg.role === 'user'
                              ? 'bg-zinc-900 text-white dark:bg-orange-500/20 dark:text-orange-200'
                              : msg.role === 'error'
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="flex gap-2 border-t border-zinc-950/10 p-3 dark:border-white/10">
                <input
                  type="text"
                  className="flex-1 rounded-full border border-zinc-950/10 bg-white px-4 py-2 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-800 dark:text-white"
                  placeholder="Ask about firewall rules..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleChatSend()
                    }
                  }}
                  disabled={chatSending}
                />
                <Button
                  variant="filled"
                  onClick={handleChatSend}
                  disabled={chatSending || !chatInput.trim()}
                >
                  {chatSending ? 'Sending...' : 'Send'}
                </Button>
              </div>
            </div>
          </section>

          {/* ---- Capabilities grid ---- */}
          <section id="capabilities" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Capabilities
            </h2>

            {loading ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : featureCaps && featureCaps.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featureCaps.map((cap, idx) => (
                  <div
                    key={cap.name ?? cap.id ?? idx}
                    className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-950 dark:text-white">
                        {cap.name ?? cap.id ?? `Capability ${idx + 1}`}
                      </span>
                      <Tag
                        color={cap.enabled !== false ? 'emerald' : 'rose'}
                        variant="medium"
                      >
                        {cap.enabled !== false ? 'ON' : 'OFF'}
                      </Tag>
                    </div>
                    {cap.description && (
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        {cap.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No capabilities reported.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
