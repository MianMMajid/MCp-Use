'use client'

import { Badge } from '@/components/badge'
import { formatDate } from '@/lib/format'

export function OrchestrationMessageBubble({ message }) {
  const role = message?.role || 'system'
  const text = message?.text || ''
  const timestamp = message?.createdAt || message?.timestamp
  const isUser = role === 'user'
  const isManager = role === 'manager'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[86%] rounded-2xl px-4 py-3 shadow-sm',
          isUser
            ? 'bg-orange-600 text-white'
            : isManager
              ? 'border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'
              : 'border border-zinc-200 bg-zinc-100 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
        ].join(' ')}
      >
        <p className="whitespace-pre-wrap text-sm leading-6">{text}</p>

        <div className="mt-2 flex items-center gap-2">
          <Badge color={isUser ? 'orange' : isManager ? 'sky' : 'zinc'}>{role}</Badge>
          {timestamp ? (
            <span className={`text-xs ${isUser ? 'text-orange-100/90' : 'text-zinc-400 dark:text-zinc-500'}`}>
              {formatDate(timestamp)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
