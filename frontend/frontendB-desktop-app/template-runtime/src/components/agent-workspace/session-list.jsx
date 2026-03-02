'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { formatDate } from '@/lib/format'
import { statusColor } from '@/lib/format'
import { PlusIcon } from '@heroicons/react/20/solid'
import { ClockIcon } from '@heroicons/react/24/outline'

export function SessionList({ sessions, activeSessionId, onSelectSession, onNewSession, loading }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <Button onClick={onNewSession} className="w-full gap-1" outline>
          <PlusIcon className="h-4 w-4" />
          New conversation
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="space-y-2 p-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
            ))}
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <ClockIcon className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              No previous conversations
            </p>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <div className="space-y-1 p-2">
            {sessions.map((session) => {
              const isActive = session.sessionId === activeSessionId
              return (
                <button
                  key={session.sessionId}
                  onClick={() => onSelectSession?.(session.sessionId)}
                  className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                    isActive
                      ? 'bg-zinc-100 dark:bg-zinc-800'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {session.lastInputPreview || `Session ${session.sessionId.substring(0, 8)}`}
                    </span>
                    <Badge color={statusColor(session.status)}>{session.status}</Badge>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {session.runCount ?? 0} runs
                    </span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {formatDate(session.updatedAt)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
