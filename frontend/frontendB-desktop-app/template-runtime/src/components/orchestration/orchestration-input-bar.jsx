'use client'

import { useCallback, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@/components/button'
import { Textarea } from '@/components/textarea'
import { PaperAirplaneIcon } from '@heroicons/react/20/solid'

export function OrchestrationInputBar({ disabled = false, busy = false, onSend, variant = 'docked' }) {
  const [value, setValue] = useState('')
  const floating = variant === 'floating'

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
    <div
      className={clsx(
        floating ? 'bg-transparent p-0' : 'bg-[var(--mayple-surface)] p-2.5',
      )}
    >
      <div
        className={clsx(
          'mx-auto max-w-3xl border bg-[var(--mayple-surface)] p-2.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900',
          floating ? 'rounded-[28px] border-zinc-300/90' : 'rounded-[24px] border-zinc-200',
        )}
      >
        <Textarea
          rows={3}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe the objective, assign timed tasks, or update constraints..."
          disabled={disabled || busy}
          className="border-transparent bg-transparent focus:border-zinc-200 focus:bg-zinc-50 dark:focus:border-zinc-700 dark:focus:bg-zinc-800"
        />
        <div className="mt-1.5 flex justify-end">
          <Button
            color="orange"
            onClick={() => submit().catch(() => {})}
            disabled={busy || disabled || !value.trim()}
            className={clsx('!rounded-full !px-3 !py-2', floating && '!px-4')}
          >
            <PaperAirplaneIcon className="h-4 w-4" />
            <span className="sr-only">{busy ? 'Sending...' : 'Send to Orchestration'}</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
