'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Textarea } from '@/components/textarea'
import { Field, Label } from '@/components/fieldset'
import { loadJson, postJson, invalidateCache, getCached } from '@/lib/api'
import { SkeletonRows } from '@/components/skeleton'

function decisionColor(d) {
  if (!d) return 'zinc'
  const s = d.toLowerCase()
  if (s === 'allow' || s === 'allowed' || s === 'pass') return 'green'
  if (s === 'block' || s === 'blocked' || s === 'deny') return 'red'
  return 'orange'
}

export default function FirewallPage() {
  const _cc = getCached('/api/chat/capabilities')
  const _cr = getCached('/api/firewall/rules/effective')
  const _cs = getCached('/api/firewall/state')
  const _cb = getCached('/api/yc/brief')
  const _hasCached = !!(_cc || _cr || _cs || _cb)
  const [capabilities, setCapabilities] = useState(_cc || null)
  const [rules, setRules] = useState(() => _cr ? (Array.isArray(_cr?.rules) ? _cr.rules : Array.isArray(_cr) ? _cr : []) : null)
  const [loading, setLoading] = useState(!_hasCached)
  const [error, setError] = useState('')

  // Decision tester state
  const [testPayload, setTestPayload] = useState('{\n  "tool": "example",\n  "args": {}\n}')
  const [previewResult, setPreviewResult] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Firewall state
  const [firewallState, setFirewallState] = useState(_cs || null)

  // YC Brief
  const [ycBrief, setYcBrief] = useState(_cb || null)

  // Chat state
  const [chatInput, setChatInput] = useState('')
  const [chatReply, setChatReply] = useState(null)
  const [chatLoading, setChatLoading] = useState(false)

  // Streaming chat state
  const [streamInput, setStreamInput] = useState('')
  const [streamOutput, setStreamOutput] = useState('')
  const [streamLoading, setStreamLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [capsData, rulesData, stateData, briefData] = await Promise.all([
          loadJson('/api/chat/capabilities').catch(() => null),
          loadJson('/api/firewall/rules/effective').catch(() => null),
          loadJson('/api/firewall/state').catch(() => null),
          loadJson('/api/yc/brief').catch(() => null),
        ])
        if (cancelled) return
        setCapabilities(capsData)
        setFirewallState(stateData)
        setYcBrief(briefData)
        setRules(Array.isArray(rulesData?.rules) ? rulesData.rules : Array.isArray(rulesData) ? rulesData : [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function handlePreview() {
    setPreviewLoading(true)
    setPreviewResult(null)
    try {
      let body = {}
      try { body = JSON.parse(testPayload) } catch { body = { raw: testPayload } }
      const res = await postJson('/api/firewall/preview', body)
      invalidateCache('/api/firewall')
      const data = await res.json().catch(() => ({}))
      setPreviewResult(data)
    } catch {
      setPreviewResult({ error: 'Preview request failed' })
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleEnforce() {
    setPreviewLoading(true)
    setPreviewResult(null)
    try {
      let body = {}
      try { body = JSON.parse(testPayload) } catch { body = { raw: testPayload } }
      const res = await postJson('/api/firewall/decision', body)
      invalidateCache('/api/firewall')
      const data = await res.json().catch(() => ({}))
      setPreviewResult(data)
    } catch {
      setPreviewResult({ error: 'Enforce request failed' })
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleChat() {
    if (!chatInput.trim()) return
    setChatLoading(true)
    setChatReply(null)
    try {
      const res = await postJson('/api/firewall/chat', { message: chatInput })
      invalidateCache('/api/firewall')
      const data = await res.json().catch(() => ({}))
      setChatReply(data)
    } catch {
      setChatReply({ error: 'Chat request failed' })
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Firewall Dashboard</Heading>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">The gateway may be starting up or temporarily unavailable.</p>
        </div>
      )}

      {loading && <SkeletonRows />}

      {/* Capabilities Cards */}
      {!loading && capabilities && (
        <>
          <Subheading className="mt-6">Capabilities</Subheading>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.aiMode != null && (
              <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">AI Mode</p>
                <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-100">{String(capabilities.aiMode)}</p>
              </div>
            )}
            {capabilities.providers != null && (
              <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Providers</p>
                <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-100">
                  {Array.isArray(capabilities.providers) ? capabilities.providers.join(', ') : String(capabilities.providers)}
                </p>
              </div>
            )}
            {capabilities.streaming != null && (
              <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Streaming</p>
                <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-100">{capabilities.streaming ? 'Enabled' : 'Disabled'}</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* YC Brief */}
      {!loading && ycBrief && (
        <>
          <Divider className="my-6" />
          <Subheading>Brief</Subheading>
          <pre className="mt-4 overflow-auto rounded-2xl border border-zinc-950/10 bg-zinc-50 p-4 text-xs text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
            {typeof ycBrief === 'string' ? ycBrief : JSON.stringify(ycBrief, null, 2)}
          </pre>
        </>
      )}

      {/* Rules Table */}
      {!loading && rules && rules.length > 0 && (
        <>
          <Divider className="my-6" />
          <Subheading>Effective Rules</Subheading>
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Rule</TableHeader>
                <TableHeader>Action</TableHeader>
                <TableHeader>Priority</TableHeader>
                <TableHeader>Scope</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map((rule, idx) => (
                <TableRow key={rule.id || idx}>
                  <TableCell className="font-medium">{rule.name || rule.id || `Rule ${idx + 1}`}</TableCell>
                  <TableCell>
                    <Badge color={decisionColor(rule.action || rule.decision)}>{rule.action || rule.decision || '--'}</Badge>
                  </TableCell>
                  <TableCell>{rule.priority ?? '--'}</TableCell>
                  <TableCell>{rule.scope || rule.pattern || '--'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {/* Decision Tester */}
      <Divider className="my-6" />
      <Subheading>Decision Tester</Subheading>
      <div className="mt-4 space-y-4">
        <Field>
          <Label>Request Payload (JSON)</Label>
          <Textarea rows={5} value={testPayload} onChange={(e) => setTestPayload(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button onClick={handlePreview} disabled={previewLoading}>
            {previewLoading ? 'Processing...' : 'Preview'}
          </Button>
          <Button color="red" onClick={handleEnforce} disabled={previewLoading}>
            Enforce
          </Button>
        </div>
        {previewResult && (
          <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Decision:</span>
              <Badge color={decisionColor(previewResult.decision || previewResult.action)}>
                {previewResult.decision || previewResult.action || 'unknown'}
              </Badge>
            </div>
            {previewResult.reason && (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{previewResult.reason}</p>
            )}
            {previewResult.error && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{previewResult.error}</p>
            )}
          </div>
        )}
      </div>

      {/* Firewall State */}
      {!loading && firewallState && (
        <>
          <Divider className="my-6" />
          <Subheading>Firewall State</Subheading>
          <pre className="mt-4 overflow-auto rounded-2xl border border-zinc-950/10 bg-zinc-50 p-4 text-xs text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
            {JSON.stringify(firewallState, null, 2)}
          </pre>
        </>
      )}

      {/* Chat Section */}
      <Divider className="my-6" />
      <Subheading>Firewall Chat</Subheading>
      <div className="mt-4 space-y-4">
        <Field>
          <Label>Message</Label>
          <Textarea rows={2} value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask about firewall rules..." />
        </Field>
        <Button onClick={handleChat} disabled={chatLoading}>
          {chatLoading ? 'Sending...' : 'Send'}
        </Button>
        {chatReply && (
          <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {chatReply.reply || chatReply.message || chatReply.response || chatReply.error || JSON.stringify(chatReply)}
            </p>
          </div>
        )}
      </div>

      {/* Streaming Chat */}
      <Divider className="my-6" />
      <Subheading>Streaming Chat</Subheading>
      <div className="mt-4 space-y-4">
        <Field>
          <Label>Message</Label>
          <Textarea rows={2} value={streamInput} onChange={(e) => setStreamInput(e.target.value)} placeholder="Send a streaming message..." />
        </Field>
        <Button onClick={() => {
          if (!streamInput.trim()) return
          setStreamLoading(true)
          setStreamOutput('')
          const body = JSON.stringify({ message: streamInput })
          fetch('/api/chat/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
            .then((res) => {
              const reader = res.body?.getReader()
              if (!reader) { setStreamOutput('Streaming not supported'); setStreamLoading(false); return }
              const decoder = new TextDecoder()
              function read() {
                reader.read().then(({ done, value }) => {
                  if (done) { setStreamLoading(false); return }
                  setStreamOutput((prev) => prev + decoder.decode(value, { stream: true }))
                  read()
                }).catch(() => setStreamLoading(false))
              }
              read()
            })
            .catch(() => { setStreamOutput('Stream request failed'); setStreamLoading(false) })
        }} disabled={streamLoading}>
          {streamLoading ? 'Streaming...' : 'Stream'}
        </Button>
        {streamOutput && (
          <pre className="overflow-auto rounded-2xl border border-zinc-950/10 bg-zinc-50 p-4 text-xs text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
            {streamOutput}
          </pre>
        )}
      </div>
    </>
  )
}
