'use client'

import { useEffect, useRef } from 'react'
import { OrchestrationMessageBubble } from '@/components/orchestration/orchestration-message-bubble'
import { OrchestrationInputBar } from '@/components/orchestration/orchestration-input-bar'
import { ShareIcon } from '@heroicons/react/24/outline'

export function OrchestrationChatPanel({
  selectedOrchestration,
  messages,
  busyAction,
  runtimeError,
  onSendMessage,
}) {
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  if (!selectedOrchestration) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950">
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
      <div className="border-b border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{selectedOrchestration.name}</p>
        {selectedOrchestration.description ? (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{selectedOrchestration.description}</p>
        ) : null}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-zinc-50 px-4 py-4 dark:bg-zinc-950">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <ShareIcon className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
            <p className="mt-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">Start orchestration conversation</p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              Define objective, success criteria, and reassignment instructions.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-3">
            {messages.map((message, index) => (
              <OrchestrationMessageBubble key={message.id || `msg-${index}`} message={message} />
            ))}
          </div>
        )}
      </div>

      {runtimeError ? (
        <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {runtimeError}
        </div>
      ) : null}

      <OrchestrationInputBar
        busy={Boolean(busyAction)}
        disabled={!selectedOrchestration}
        onSend={onSendMessage}
      />
    </div>
  )
}
