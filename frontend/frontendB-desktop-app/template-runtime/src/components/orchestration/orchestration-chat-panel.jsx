'use client'

import { useEffect, useRef } from 'react'
import { OrchestrationMessageBubble } from '@/components/orchestration/orchestration-message-bubble'
import { OrchestrationInputBar } from '@/components/orchestration/orchestration-input-bar'
import { ShareIcon } from '@heroicons/react/24/outline'

const CHAT_SCROLL_KEY = 'mayple_chat_scroll_position'

export function OrchestrationChatPanel({
  selectedOrchestration,
  messages,
  busyAction,
  runtimeError,
  onSendMessage,
}) {
  const scrollRef = useRef(null)
  const showCenteredComposer = messages.length === 0

  useEffect(() => {
    if (!scrollRef.current) return
    if (messages.length === 0) {
      const stored = Number(window.localStorage.getItem(CHAT_SCROLL_KEY) || 0)
      if (Number.isFinite(stored) && stored > 0) scrollRef.current.scrollTop = stored
      return
    }
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  if (!selectedOrchestration) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--mayple-bg)]">
        <ShareIcon className="h-12 w-12 text-zinc-300 dark:text-zinc-600" />
        <h2 className="mt-4 text-lg font-medium text-zinc-900 dark:text-white">Select an orchestration</h2>
        <p className="mt-2 max-w-sm text-center text-sm text-zinc-500 dark:text-zinc-400">
          Use the left panel to pick an orchestration and start manager-driven execution chat.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200/80 bg-[var(--mayple-surface)] px-4 py-2.5 dark:border-zinc-800">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{selectedOrchestration.name}</p>
        {selectedOrchestration.description ? (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{selectedOrchestration.description}</p>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-[var(--mayple-bg)] px-3 py-4"
        onScroll={(event) => {
          if (typeof window === 'undefined') return
          window.localStorage.setItem(CHAT_SCROLL_KEY, String(event.currentTarget.scrollTop || 0))
        }}
      >
        {showCenteredComposer ? (
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center text-center">
            <ShareIcon className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
            <p className="mt-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">Start orchestration conversation</p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              Define objective, success criteria, and reassignment instructions.
            </p>
            <div className="mt-4 w-full">
              <OrchestrationInputBar
                busy={Boolean(busyAction)}
                disabled={!selectedOrchestration}
                onSend={onSendMessage}
                variant="floating"
              />
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-3 pb-4">
            {messages.map((message, index) => (
              <OrchestrationMessageBubble key={message.id || `msg-${index}`} message={message} />
            ))}
          </div>
        )}
      </div>

      {runtimeError ? (
        <div className="bg-red-50 px-4 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {runtimeError}
        </div>
      ) : null}

      {!showCenteredComposer ? (
        <OrchestrationInputBar
          busy={Boolean(busyAction)}
          disabled={!selectedOrchestration}
          onSend={onSendMessage}
        />
      ) : null}
    </div>
  )
}
