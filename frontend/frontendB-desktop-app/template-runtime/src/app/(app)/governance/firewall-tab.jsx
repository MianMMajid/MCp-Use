'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Divider } from '@/components/divider'
import { Subheading } from '@/components/heading'
import { Textarea } from '@/components/textarea'
import { Field, Label } from '@/components/fieldset'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, postJson, getCached } from '@/lib/api'
import { SkeletonRows } from '@/components/skeleton'

function decisionColor(d) {
  if (!d) return 'zinc'
  const s = String(d).toLowerCase()
  if (s === 'allow' || s === 'allowed' || s === 'pass') return 'green'
  if (s === 'block' || s === 'blocked' || s === 'deny') return 'red'
  return 'orange'
}

export default function FirewallTab() {
  const _cc = getCached('/api/chat/capabilities')
  const _cr = getCached('/api/firewall/rules/effective')
  const _cs = getCached('/api/firewall/state')
  const _hasCached = !!(_cc || _cr || _cs)

  const [capabilities, setCapabilities] = useState(_cc || null)
  const [rules, setRules] = useState(() => {
    if (!_cr) return null
    return Array.isArray(_cr?.rules) ? _cr.rules : Array.isArray(_cr) ? _cr : null
  })
  const [firewallState, setFirewallState] = useState(_cs || null)
  const [loading, setLoading] = useState(!_hasCached)
  const [error, setError] = useState('')

  // Decision tester
  const [testPayload, setTestPayload] = useState('{\n  "tool": "example_tool",\n  "input": {}\n}')
  const [previewResult, setPreviewResult] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [capData, rulesData, stateData] = await Promise.all([
          loadJson('/api/chat/capabilities'),
          loadJson('/api/firewall/rules/effective'),
          loadJson('/api/firewall/state'),
        ])
        if (cancelled) return
        setCapabilities(capData)
        setRules(Array.isArray(rulesData?.rules) ? rulesData.rules : Array.isArray(rulesData) ? rulesData : [])
        setFirewallState(stateData)
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
      let body
      try { body = JSON.parse(testPayload) } catch { body = { input: testPayload } }
      const res = await postJson('/api/firewall/preview', body)
      const data = await res.json().catch(() => ({}))
      setPreviewResult(data)
    } catch {
      setPreviewResult({ error: 'Preview failed' })
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleEnforce() {
    setPreviewLoading(true)
    setPreviewResult(null)
    try {
      let body
      try { body = JSON.parse(testPayload) } catch { body = { input: testPayload } }
      const res = await postJson('/api/firewall/decision', body)
      const data = await res.json().catch(() => ({}))
      setPreviewResult(data)
    } catch {
      setPreviewResult({ error: 'Decision failed' })
    } finally {
      setPreviewLoading(false)
    }
  }

  if (loading) return <SkeletonRows />

  return (
    <div className="mt-4 space-y-8">
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{error}</p>
        </div>
      )}

      {/* Capabilities */}
      {capabilities && (
        <div>
          <Subheading>Capabilities</Subheading>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500">AI Mode</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white">{capabilities.aiMode || capabilities.mode || '--'}</p>
            </div>
            <div className="rounded-2xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500">Providers</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white">
                {Array.isArray(capabilities.providers) ? capabilities.providers.join(', ') : capabilities.providers || '--'}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500">Streaming</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white">{capabilities.streaming ? 'Enabled' : 'Disabled'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Effective Rules */}
      {rules && rules.length > 0 && (
        <div>
          <Subheading>Effective Rules</Subheading>
          <Table className="mt-3 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
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
                  <TableCell className="font-mono text-xs">{rule.name || rule.pattern || rule.tool || `Rule ${idx + 1}`}</TableCell>
                  <TableCell><Badge color={decisionColor(rule.action || rule.decision)}>{rule.action || rule.decision || '--'}</Badge></TableCell>
                  <TableCell>{rule.priority ?? '--'}</TableCell>
                  <TableCell className="text-zinc-500">{rule.scope || rule.tenant || '--'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Divider />

      {/* Decision Tester */}
      <div>
        <Subheading>Decision Tester</Subheading>
        <div className="mt-3">
          <Field>
            <Label>Test Payload (JSON)</Label>
            <Textarea rows={5} value={testPayload} onChange={(e) => setTestPayload(e.target.value)} className="font-mono text-xs" />
          </Field>
          <div className="mt-3 flex gap-2">
            <Button disabled={previewLoading} onClick={handlePreview}>Preview</Button>
            <Button disabled={previewLoading} color="red" onClick={handleEnforce}>Enforce</Button>
          </div>
        </div>

        {previewResult && (
          <div className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            {previewResult.decision && (
              <div className="mb-3">
                <Badge color={decisionColor(previewResult.decision)}>{previewResult.decision}</Badge>
              </div>
            )}
            <pre className="overflow-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {JSON.stringify(previewResult, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Firewall State */}
      {firewallState && (
        <div>
          <Subheading>Firewall State</Subheading>
          <pre className="mt-3 overflow-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {JSON.stringify(firewallState, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
