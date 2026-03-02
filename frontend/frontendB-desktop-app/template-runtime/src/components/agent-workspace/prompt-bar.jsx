'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/button'
import { StopButton } from '@/components/stop-button'
import { PaperAirplaneIcon } from '@heroicons/react/20/solid'

export function PromptBar({ onSend, streaming, sessionId, onStopped, disabled }) {
  const [value, setValue] = useState('')
  const textareaRef = useRef(null)

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
    <div className="border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          disabled={streaming || disabled}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
        />
        {streaming ? (
          <StopButton sessionId={sessionId} onStopped={onStopped} />
        ) : (
          <Button onClick={handleSubmit} disabled={!value.trim() || disabled} className="gap-1">
            <PaperAirplaneIcon className="h-4 w-4" />
            Send
          </Button>
        )}
      </div>
    </div>
  )
}
