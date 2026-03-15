'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Switch } from '@/components/switch'
import { Field, Label, Description } from '@/components/fieldset'
import { XMarkIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/20/solid'

export function EdgeConfigPanel({ edge, nodes, onClose, onRemoveEdge, onUpdatePolicy }) {
  const [constraintsOpen, setConstraintsOpen] = useState(false)
  const [policy, setPolicy] = useState(null)

  useEffect(() => {
    if (edge?.data?.delegationPolicy) {
      setPolicy({ ...edge.data.delegationPolicy })
    }
  }, [edge?.id, edge?.data?.delegationPolicy])

  if (!edge || !policy) return null

  const sourceName = nodes.find((n) => n.id === edge.source)?.data?.agent?.name ?? edge.source.substring(0, 8)
  const targetName = nodes.find((n) => n.id === edge.target)?.data?.agent?.name ?? edge.target.substring(0, 8)

  const updateField = (field, value) => {
    const updated = { ...policy, [field]: value }
    setPolicy(updated)
    onUpdatePolicy(edge.id, updated)
  }

  const updateConstraint = (field, value) => {
    const updated = {
      ...policy,
      constraints: { ...policy.constraints, [field]: value },
    }
    setPolicy(updated)
    onUpdatePolicy(edge.id, updated)
  }

  return (
      <aside className="shrink-0 overflow-hidden border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex h-full w-96 flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              {sourceName} &rarr; {targetName}
            </h3>
            <button
              onClick={onClose}
              className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <XMarkIcon className="h-4 w-4 text-zinc-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Allowed Tools */}
            <Field>
              <Label>Allowed Tools</Label>
              <Description>Comma-separated list of tools this edge permits</Description>
              <Input
                value={(policy.allowedTools ?? []).join(', ')}
                onChange={(e) => updateField('allowedTools', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                placeholder="read_file, write_file"
              />
            </Field>

            {/* Denied Tools */}
            <Field>
              <Label>Denied Tools</Label>
              <Description>Comma-separated list of tools to block</Description>
              <Input
                value={(policy.deniedTools ?? []).join(', ')}
                onChange={(e) => updateField('deniedTools', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                placeholder="execute_command"
              />
            </Field>

            {/* Risk Ceiling */}
            <Field>
              <Label>Risk Ceiling</Label>
              <Select
                value={policy.riskCeiling ?? 'medium'}
                onChange={(e) => updateField('riskCeiling', e.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </Select>
            </Field>

            {/* Requires Approval */}
            <Field>
              <Label>Requires Approval</Label>
              <Description>Delegation requires human approval before executing</Description>
              <Switch
                color="orange"
                checked={policy.requiresApproval ?? true}
                onChange={(checked) => updateField('requiresApproval', checked)}
              />
            </Field>

            {/* Constraints (collapsible) */}
            <div>
              <button
                onClick={() => setConstraintsOpen(!constraintsOpen)}
                className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
              >
                {constraintsOpen
                  ? <ChevronDownIcon className="h-3.5 w-3.5" />
                  : <ChevronRightIcon className="h-3.5 w-3.5" />
                }
                Constraints
              </button>

              {constraintsOpen && (
                <div className="mt-3 space-y-3 pl-1">
                  <Field>
                    <Label>Timebox (seconds)</Label>
                    <Input
                      type="number"
                      value={policy.constraints?.timeboxSeconds ?? 300}
                      onChange={(e) => updateConstraint('timeboxSeconds', Number(e.target.value))}
                    />
                  </Field>

                  <Field>
                    <Label>Row Limit</Label>
                    <Input
                      type="number"
                      value={policy.constraints?.rowLimit ?? 100}
                      onChange={(e) => updateConstraint('rowLimit', Number(e.target.value))}
                    />
                  </Field>

                  <Field>
                    <Label>Allowed Endpoints</Label>
                    <Description>Comma-separated URL patterns</Description>
                    <Input
                      value={(policy.constraints?.allowedEndpoints ?? []).join(', ')}
                      onChange={(e) =>
                        updateConstraint('allowedEndpoints', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))
                      }
                      placeholder="https://api.example.com/*"
                    />
                  </Field>

                  <Field>
                    <Label>Rate Limit (req/min)</Label>
                    <Input
                      type="number"
                      value={policy.constraints?.rateLimit ?? 10}
                      onChange={(e) => updateConstraint('rateLimit', Number(e.target.value))}
                    />
                  </Field>
                </div>
              )}
            </div>

            {/* Escalation Chain (placeholder) */}
            <Field>
              <Label>Escalation Chain</Label>
              <Description>Select escalation chain (coming soon)</Description>
              <Select disabled value="">
                <option value="">None (default)</option>
              </Select>
            </Field>
          </div>

          {/* Actions */}
          <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
            <Button
              outline
              className="w-full text-red-600 hover:text-red-700 dark:text-red-400"
              onClick={() => onRemoveEdge(edge.id)}
            >
              Remove Edge
            </Button>
          </div>
        </div>
      </aside>
  )
}
