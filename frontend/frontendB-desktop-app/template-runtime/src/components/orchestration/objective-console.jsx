'use client'

import { useState } from 'react'
import { Button } from '@/components/button'
import { Textarea } from '@/components/textarea'
import { ObjectiveSchemaForm } from '@/components/orchestration/objective-schema-form'
import { OrchestrationConversationThread } from '@/components/orchestration/orchestration-conversation-thread'

export function ObjectiveConsole({
  objectivePackage,
  objectiveErrors,
  conversation,
  runtimeBusyAction,
  onObjectiveFieldChange,
  onSendMessage,
  onStartLiveLoop,
  onStartDryRun,
}) {
  const [composer, setComposer] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSend() {
    const text = composer.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await onSendMessage(text)
      setComposer('')
    } catch {
      // runtime notice is handled by orchestration hook
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="border-t border-zinc-200/80 bg-[var(--mayple-surface)] px-3 py-2.5 dark:border-zinc-800">
      <div className="mx-auto max-w-6xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Objective Console</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Text-only orchestration manager loop control</p>
          </div>
          <div className="flex gap-2">
            <Button color="orange" disabled={runtimeBusyAction === 'execute'} onClick={onStartLiveLoop}>Start Live Loop</Button>
            <Button outline disabled={runtimeBusyAction === 'dry-run'} onClick={onStartDryRun}>Start Dry Run</Button>
          </div>
        </div>

        <OrchestrationConversationThread messages={conversation} />

        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <Textarea
            rows={3}
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            placeholder="Tell the orchestration manager the objective, constraints, or task reassignment instructions..."
          />
          <div className="mt-2 flex justify-end">
            <Button outline disabled={sending || !composer.trim()} onClick={handleSend}>
              {sending ? 'Sending...' : 'Send Message'}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-3 text-xs font-semibold text-zinc-700 dark:text-zinc-200">Objective Package</p>
          <ObjectiveSchemaForm value={objectivePackage} errors={objectiveErrors} onChange={onObjectiveFieldChange} />
        </div>
      </div>
    </section>
  )
}
