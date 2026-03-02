'use client'

import { useState } from 'react'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Textarea } from '@/components/textarea'
import { Select } from '@/components/select'
import { RiskBadge } from '@/components/risk-badge'
import { postJson } from '@/lib/api'

export function NewTaskDialog({ open, onClose, agents = [] }) {
  const [agentId, setAgentId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState('turn')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const selectedAgent = agents.find((a) => a.id === agentId)

  async function handleSubmit() {
    if (!agentId || !prompt.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const body = mode === 'longform'
        ? { objective: prompt, mode: 'longform' }
        : { message: prompt, mode: 'turn' }
      await postJson(`/api/agents/${agentId}/run`, body)
      onClose?.()
      setPrompt('')
      setAgentId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start task')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>New Task</DialogTitle>
      <DialogDescription>Start a new agent run with a prompt or objective.</DialogDescription>
      <DialogBody>
        <div className="space-y-4">
          <Field>
            <Label>Agent</Label>
            <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">Select an agent...</option>
              {agents.filter((a) => a.status === 'active').map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>

          {selectedAgent && (
            <div className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800">
              <span className="text-xs text-zinc-500">Risk:</span>
              <RiskBadge tier={selectedAgent.riskTier} />
            </div>
          )}

          <Field>
            <Label>Prompt / Objective</Label>
            <Textarea
              rows={4}
              placeholder="Describe what you want the agent to do..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </Field>

          <Field>
            <Label>Run Mode</Label>
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="turn">Single turn</option>
              <option value="longform">Multi-turn (longform)</option>
            </Select>
          </Field>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>Cancel</Button>
        <Button disabled={submitting || !agentId || !prompt.trim()} onClick={handleSubmit}>
          {submitting ? 'Starting...' : 'Start Run'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
