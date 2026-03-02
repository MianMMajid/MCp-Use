'use client'

import { useRef, useEffect } from 'react'
import { TraceStep } from './trace-step'
import { SignalIcon } from '@heroicons/react/24/outline'

export function ExecutionTrace({ events, currentRunId }) {
  const scrollRef = useRef(null)

  const filtered = currentRunId
    ? events.filter(
        (e) => String(e.payload?.runId ?? '') === currentRunId || !e.payload?.runId
      )
    : events

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filtered.length])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <SignalIcon className="h-4 w-4 text-zinc-400" />
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          Execution Trace
        </span>
        {filtered.length > 0 && (
          <span className="ml-auto text-xs text-zinc-400">{filtered.length} events</span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <SignalIcon className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              Events will appear here when the agent starts working.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((event, idx) => (
              <TraceStep key={event.id ?? idx} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
