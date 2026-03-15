'use client'

import { Badge } from '@/components/badge'
import { formatDate } from '@/lib/format'

function roleColor(role) {
  if (role === 'user') return 'zinc'
  if (role === 'manager') return 'orange'
  return 'indigo'
}

export function OrchestrationConversationThread({ messages = [] }) {
  if (!messages.length) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        Start with a text objective. The manager will keep a loop-oriented plan context.
      </div>
    )
  }

  return (
    <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      {messages.slice(-60).map((message) => (
        <div key={message.id || `${message.role}-${message.createdAt}`} className="rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Badge color={roleColor(message.role)}>{message.role || 'system'}</Badge>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{formatDate(message.createdAt)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-200">{message.text}</p>
        </div>
      ))}
    </div>
  )
}
