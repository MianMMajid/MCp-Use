'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/button'
import { Textarea } from '@/components/textarea'

export function OrchestrationInputBar({ disabled = false, busy = false, onSend }) {
  const [value, setValue] = useState('')

  const submit = useCallback(async () => {
    const trimmed = value.trim()
    if (!trimmed || disabled || busy) return
    await onSend?.(trimmed)
    setValue('')
  }, [value, disabled, busy, onSend])

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit().catch(() => {})
    }
  }

  return (
    <div className="border-t border-zinc-200 bg-white/80 p-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto max-w-4xl space-y-2">
        <Textarea
          rows={3}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe the objective, assign timed tasks, or update constraints..."
          disabled={disabled || busy}
        />
        <div className="flex justify-end">
          <Button color="orange" onClick={() => submit().catch(() => {})} disabled={busy || disabled || !value.trim()}>
            {busy ? 'Sending...' : 'Send to Orchestration'}
          </Button>
        </div>
      </div>
    </div>
  )
}
