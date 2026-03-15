'use client'

import { Badge } from './badge'
import { formatDate, statusColor } from '@/lib/format'

export function Timeline({ events = [] }) {
  if (events.length === 0) return null

  return (
    <div className="relative ml-3">
      {/* Vertical line */}
      <div className="absolute left-0 top-2 bottom-2 w-px bg-zinc-200 dark:bg-zinc-700" />

      <div className="space-y-4">
        {events.map((event, idx) => {
          const type = event.eventType || event.type || event.event || 'event'
          const status = event.status || type
          const title = event.name || event.message || event.description || type
          const timestamp = event.timestamp || event.at || event.createdAt

          return (
            <div key={event.id || idx} className="relative flex gap-4 pl-6">
              {/* Dot */}
              <div className="absolute left-0 top-1.5 -translate-x-1/2">
                <div className="h-2.5 w-2.5 rounded-full border-2 border-white bg-zinc-400 dark:border-zinc-950" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge color={statusColor(status)} className="shrink-0">{type}</Badge>
                    <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">{title}</p>
                  </div>
                  {timestamp && (
                    <p className="shrink-0 text-xs text-zinc-400">{formatDate(timestamp)}</p>
                  )}
                </div>
                {event.details && (
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{typeof event.details === 'string' ? event.details : JSON.stringify(event.details)}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
