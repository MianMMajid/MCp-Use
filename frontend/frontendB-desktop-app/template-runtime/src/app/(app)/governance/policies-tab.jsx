'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Divider } from '@/components/divider'
import { Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import { Field, Label } from '@/components/fieldset'
import { loadJson, postJson } from '@/lib/api'
import { statusColor } from '@/lib/format'
import { SkeletonCard } from '@/components/skeleton'

export default function PoliciesTab() {
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState([{ toolPattern: '', action: 'allow', priority: 0 }])
  const [policyResult, setPolicyResult] = useState(null)
  const [policyLoading, setPolicyLoading] = useState(false)
  const [rawMode, setRawMode] = useState(false)
  const [rawJson, setRawJson] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadJson('/api/openclaw/modifier/capabilities').catch(() => null)
        if (cancelled) return
        if (data?.rules && Array.isArray(data.rules)) {
          setRules(data.rules.map((r) => ({
            toolPattern: r.toolPattern || r.tool || r.pattern || '',
            action: r.action || 'allow',
            priority: r.priority ?? 0,
          })))
        }
        setRawJson(JSON.stringify(data || {}, null, 2))
      } catch {
        // Fall through with default empty rule
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  function addRule() {
    setRules([...rules, { toolPattern: '', action: 'allow', priority: 0 }])
  }

  function updateRule(idx, field, value) {
    setRules(rules.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  function removeRule(idx) {
    setRules(rules.filter((_, i) => i !== idx))
  }

  async function handleAction(action) {
    setPolicyLoading(true)
    setPolicyResult(null)
    try {
      const body = rawMode
        ? (() => { try { return JSON.parse(rawJson) } catch { return { raw: rawJson } } })()
        : { rules }
      const res = await postJson(`/api/operations/orchestrations/policy/${action}`, body)
      const data = await res.json().catch(() => ({}))
      setPolicyResult({ action, data })
    } catch (err) {
      setPolicyResult({ action, error: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setPolicyLoading(false)
    }
  }

  if (loading) return <SkeletonCard />

  return (
    <div className="mt-4 space-y-6">
      <div className="flex items-center justify-between">
        <Subheading>Policy Rules</Subheading>
        <div className="flex gap-2">
          <Button plain onClick={() => setRawMode(!rawMode)}>
            {rawMode ? 'Structured Editor' : 'Raw JSON'}
          </Button>
          {!rawMode && <Button onClick={addRule}>Add Rule</Button>}
        </div>
      </div>

      {rawMode ? (
        <Field>
          <Label>Policy JSON</Label>
          <Textarea rows={12} value={rawJson} onChange={(e) => setRawJson(e.target.value)} className="font-mono text-xs" />
        </Field>
      ) : (
        <div className="space-y-3">
          {rules.map((rule, idx) => (
            <div key={idx} className="flex items-end gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <Field className="flex-1">
                <Label>Tool Pattern</Label>
                <Input
                  value={rule.toolPattern}
                  onChange={(e) => updateRule(idx, 'toolPattern', e.target.value)}
                  placeholder="e.g. tool:*"
                />
              </Field>
              <Field className="w-40">
                <Label>Action</Label>
                <Select value={rule.action} onChange={(e) => updateRule(idx, 'action', e.target.value)}>
                  <option value="allow">Allow</option>
                  <option value="block">Block</option>
                  <option value="require_approval">Require Approval</option>
                </Select>
              </Field>
              <Field className="w-24">
                <Label>Priority</Label>
                <Input
                  type="number"
                  value={rule.priority}
                  onChange={(e) => updateRule(idx, 'priority', parseInt(e.target.value) || 0)}
                />
              </Field>
              <Button plain className="!text-red-500 mb-0.5" onClick={() => removeRule(idx)}>Remove</Button>
            </div>
          ))}
          {rules.length === 0 && (
            <p className="text-sm text-zinc-500">No rules defined. Click "Add Rule" to start.</p>
          )}
        </div>
      )}

      <Divider />

      <div className="flex flex-wrap gap-2">
        <Button disabled={policyLoading} onClick={() => handleAction('simulate')}>Simulate</Button>
        <Button disabled={policyLoading} onClick={() => handleAction('diff')}>Diff</Button>
        <Button disabled={policyLoading} onClick={() => handleAction('dry-run')}>Dry-Run</Button>
        <Button disabled={policyLoading} onClick={() => handleAction('apply')}>Apply</Button>
        <Button disabled={policyLoading} onClick={() => handleAction('diff-before-apply')}>Diff & Apply</Button>
        <Button disabled={policyLoading} color="red" onClick={() => handleAction('rollback')}>Rollback</Button>
      </div>

      {policyResult && (
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <div className="flex items-center gap-2 mb-3">
            <Subheading>Result: {policyResult.action}</Subheading>
            <Badge color={policyResult.error ? 'red' : 'green'}>
              {policyResult.error ? 'Failed' : 'Success'}
            </Badge>
          </div>
          {policyResult.error ? (
            <p className="text-sm text-red-600">{policyResult.error}</p>
          ) : (
            <pre className="overflow-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {JSON.stringify(policyResult.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
