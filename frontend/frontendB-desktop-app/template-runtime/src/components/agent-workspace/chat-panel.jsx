'use client'

import { useRef, useEffect } from 'react'
import { MessageBubble } from './message-bubble'
import { PromptBar } from './prompt-bar'
import { Button } from '@/components/button'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'

export function ChatPanel({
  messages,
  onSend,
  streaming,
  sessionId,
  onStopped,
  error,
  onRetry,
  disabled,
}) {
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streaming])

  return (
    <div className="flex h-full flex-col">
      {/* scrollable message area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streaming && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <ChatBubbleLeftRightIcon className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
            <p className="mt-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Start a conversation
            </p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              Type a message below to begin interacting with this agent.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id ?? idx}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
              cost={msg.cost}
              error={msg.error}
            />
          ))}

          {streaming && (
            <div className="flex justify-start">
              <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Something went wrong</p>
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{error}</p>
            {onRetry && (
              <Button color="amber" className="mt-2" onClick={onRetry}>
                Retry
              </Button>
            )}
          </div>
        )}
      </div>

      {/* prompt bar */}
      <PromptBar
        onSend={onSend}
        streaming={streaming}
        sessionId={sessionId}
        onStopped={onStopped}
        disabled={disabled}
      />
    </div>
  )
}
