'use client'

import { useState } from 'react'
import { Button } from '@/components/button'
import { Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { ReassignmentQueue } from '@/components/orchestration/reassignment-queue'

function emptyForm(tasks = []) {
  return {
    taskId: tasks[0]?.id || '',
    dueAt: '',
    repeatIntervalMinutes: '',
    maxRepeats: '1',
    targetRole: '',
    targetAgentId: '',
    reason: '',
  }
}

export function TimedTaskPanel({
  tasks = [],
  reassignments = [],
  runtimeBusyAction,
  onCreateReassignment,
  onCancelReassignment,
}) {
  const [form, setForm] = useState(emptyForm(tasks))
  const [error, setError] = useState('')
  const busy = Boolean(runtimeBusyAction)

  function updateField(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'targetRole' && value) next.targetAgentId = ''
      if (field === 'targetAgentId' && value) next.targetRole = ''
      return next
    })
  }

  async function handleSubmit() {
    setError('')
    try {
      await onCreateReassignment({
        taskId: form.taskId,
        dueAt: form.dueAt,
        repeatIntervalMinutes: form.repeatIntervalMinutes,
        maxRepeats: form.maxRepeats,
        targetRole: form.targetRole,
        targetAgentId: form.targetAgentId,
        reason: form.reason,
      })
      setForm(emptyForm(tasks))
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Failed to schedule reassignment')
    }
  }

  return (
    <section className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto grid max-w-[1800px] gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Timed Task Reassignment</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <Field>
              <Label>Task</Label>
              <Select value={form.taskId} onChange={(event) => updateField('taskId', event.target.value)}>
                <option value="">Select task</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>{task.title || task.id}</option>
                ))}
              </Select>
            </Field>

            <Field>
              <Label>Delay Until</Label>
              <Input type="datetime-local" value={form.dueAt} onChange={(event) => updateField('dueAt', event.target.value)} />
            </Field>

            <Field>
              <Label>Repeat Interval (minutes)</Label>
              <Input type="number" min="1" value={form.repeatIntervalMinutes} onChange={(event) => updateField('repeatIntervalMinutes', event.target.value)} placeholder="Optional" />
            </Field>

            <Field>
              <Label>Max Repeats</Label>
              <Input type="number" min="1" value={form.maxRepeats} onChange={(event) => updateField('maxRepeats', event.target.value)} />
            </Field>

            <Field>
              <Label>Target Role</Label>
              <Input value={form.targetRole} onChange={(event) => updateField('targetRole', event.target.value)} placeholder="manager / worker-email" />
            </Field>

            <Field>
              <Label>Target Agent</Label>
              <Input value={form.targetAgentId} onChange={(event) => updateField('targetAgentId', event.target.value)} placeholder="agent-2" />
            </Field>

            <Field className="md:col-span-2">
              <Label>Reason</Label>
              <Input value={form.reason} onChange={(event) => updateField('reason', event.target.value)} placeholder="Why should this reassignment happen?" />
            </Field>
          </div>

          {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}

          <div className="mt-3 flex justify-end">
            <Button color="orange" disabled={busy || !form.taskId || !form.dueAt} onClick={handleSubmit}>Queue Reassignment</Button>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Reassignment Queue</p>
          <ReassignmentQueue items={reassignments} disabled={busy} onCancel={onCancelReassignment} />
        </div>
      </div>
    </section>
  )
}
