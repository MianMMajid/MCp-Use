'use client'

import { Badge } from '@/components/badge'
import { formatDate } from '@/lib/format'

export function MessageBubble({ role, content, timestamp, cost, error }) {
  const isUser = role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-[24px] px-4 py-3 shadow-sm ${
          isUser
            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
            : error
              ? 'border border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
              : 'border border-zinc-200 bg-[var(--mayple-surface)] text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'
        }`}
      >
        <p className="whitespace-pre-wrap text-sm">{content}</p>

        <div className="mt-2 flex items-center gap-2">
          {timestamp && (
            <span className={`text-xs ${isUser ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-400 dark:text-zinc-500'}`}>
              {formatDate(timestamp)}
            </span>
          )}
          {cost && (
            <Badge color="sky">
              {cost.inputTokens + cost.outputTokens} tokens
              {cost.estimatedCostUsd ? ` · $${cost.estimatedCostUsd.toFixed(4)}` : ''}
            </Badge>
          )}
          {error && <Badge color="red">Error</Badge>}
        </div>
      </div>
    </div>
  )
}
