'use client'

import { useState, useRef, useCallback } from 'react'
import clsx from 'clsx'
import { Button } from '@/components/button'
import { StopButton } from '@/components/stop-button'
import { PaperAirplaneIcon } from '@heroicons/react/20/solid'

export function PromptBar({ onSend, streaming, sessionId, onStopped, disabled, variant = 'docked' }) {
  const [value, setValue] = useState('')
  const textareaRef = useRef(null)
  const floating = variant === 'floating'

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || streaming || disabled) return
    onSend?.(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, streaming, disabled, onSend])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleInput(e) {
    setValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  return (
    <div
      className={clsx(
        floating
          ? 'bg-transparent px-3 py-0'
          : 'bg-[var(--mayple-surface)] px-3 py-2.5',
      )}
    >
      <div
        className={clsx(
          'mx-auto flex w-full max-w-3xl items-end gap-2 border bg-[var(--mayple-surface)] px-3 py-2 shadow-sm dark:border-zinc-700',
          floating ? 'rounded-[28px] border-zinc-300/90 dark:bg-zinc-900' : 'rounded-[24px] border-zinc-200',
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          disabled={streaming || disabled}
          rows={1}
          className={clsx(
            'flex-1 resize-none border border-transparent bg-transparent px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-200 focus:bg-zinc-50 focus:outline-none dark:text-zinc-100 dark:focus:border-zinc-700 dark:focus:bg-zinc-800',
            floating ? 'rounded-2xl' : 'rounded-xl',
          )}
        />
        {streaming ? (
          <StopButton sessionId={sessionId} onStopped={onStopped} compact={floating} />
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!value.trim() || disabled}
            className={clsx('!rounded-full !px-3 !py-2')}
          >
            <PaperAirplaneIcon className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        )}
      </div>
    </div>
  )
}
