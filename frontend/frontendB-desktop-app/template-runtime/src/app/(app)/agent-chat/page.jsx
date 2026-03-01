'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Input } from '@/components/input'
import { Textarea } from '@/components/textarea'
import { Field, Label } from '@/components/fieldset'
import { loadJson, postJson } from '@/lib/api'

function statusColor(s) {
  if (!s) return 'zinc'
  const v = s.toLowerCase()
  if (v === 'online' || v === 'ready' || v === 'active') return 'green'
  if (v === 'offline' || v === 'error') return 'red'
  return 'orange'
}

export default function AgentChatPage() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('turn') // 'turn' | 'longform'
  const [input, setInput] = useState('')
  const [reply, setReply] = useState(null)
  const [sending, setSending] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadJson('/api/openclaw/agent/status')
        if (!cancelled) setStatus(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function handleSubmit() {
    if (!input.trim()) return
    setSending(true)
    setReply(null)
    try {
      const endpoint = mode === 'longform' ? '/api/openclaw/agent/longform' : '/api/openclaw/agent/turn'
      const body = mode === 'longform' ? { objective: input } : { message: input }
      const res = await postJson(endpoint, body)
      const data = await res.json().catch(() => ({}))
      setReply(data)
    } catch {
      setReply({ error: 'Request failed' })
    } finally {
      setSending(false)
    }
  }

  const agentStatus = status?.status || status?.state || 'unknown'

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <Heading>Agent Chat</Heading>
          {!loading && <Badge color={statusColor(agentStatus)}>{agentStatus}</Badge>}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">The gateway may be starting up or temporarily unavailable.</p>
        </div>
      )}

      {/* Mode Toggle */}
      <div className="mt-6 flex gap-2">
        <Button outline={mode !== 'turn'} onClick={() => setMode('turn')}>Single Turn</Button>
        <Button outline={mode !== 'longform'} onClick={() => setMode('longform')}>Longform</Button>
      </div>

      <Divider className="my-6" />

      {/* Input */}
      <div className="space-y-4">
        <Field>
          <Label>{mode === 'longform' ? 'Objective' : 'Message'}</Label>
          <Textarea
            rows={mode === 'longform' ? 5 : 2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === 'longform' ? 'Describe your objective...' : 'Type a message...'}
          />
        </Field>
        <Button onClick={handleSubmit} disabled={sending}>
          {sending ? 'Sending...' : 'Submit'}
        </Button>
      </div>

      {/* Reply */}
      {reply && (
        <>
          <Divider className="my-6" />
          <div className="flex items-center justify-between">
            <Subheading>Response</Subheading>
            <Button plain onClick={() => setShowRaw(!showRaw)}>
              {showRaw ? 'Formatted' : 'Raw JSON'}
            </Button>
          </div>
          <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            {showRaw ? (
              <pre className="overflow-auto text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(reply, null, 2)}</pre>
            ) : (
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {reply.reply || reply.message || reply.response || reply.result || reply.error || JSON.stringify(reply)}
              </p>
            )}
          </div>
        </>
      )}
    </>
  )
}
