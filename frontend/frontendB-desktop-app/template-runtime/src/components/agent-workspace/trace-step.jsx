'use client'

import { useState } from 'react'
import { Badge } from '@/components/badge'
import { formatDate } from '@/lib/format'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/16/solid'

const TYPE_COLORS = {
  tool_call: 'sky',
  shell: 'zinc',
  browser: 'indigo',
  network: 'purple',
  email: 'teal',
  system: 'yellow',
  prompt: 'green',
}

export function TraceStep({ event }) {
  const [expanded, setExpanded] = useState(false)

  const eventType = event.eventType ?? event.type ?? 'event'
  const color = TYPE_COLORS[eventType] ?? 'zinc'
  const payload = event.payload ?? {}
  const riskScore = payload.riskScore ?? null
  const isRisky = typeof riskScore === 'number' && riskScore > 0.6
  const isShell = eventType === 'shell'
  const command = payload.command ?? payload.cmd ?? null

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {expanded ? (
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-zinc-400" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-400" />
        )}
        <Badge color={color}>{eventType}</Badge>
        {isRisky && <Badge color="red">risk {riskScore.toFixed(2)}</Badge>}
        <span className="flex-1 truncate text-xs text-zinc-600 dark:text-zinc-400">
          {payload.name ?? payload.toolName ?? command ?? event.id ?? ''}
        </span>
        <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
          {formatDate(event.timestamp)}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
          {isShell && command && (
            <pre className="mb-2 rounded bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              $ {command}
            </pre>
          )}

          {payload.input != null && (
            <div className="mb-2">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Input</p>
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-zinc-50 px-2 py-1 font-mono text-xs text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
                {typeof payload.input === 'string' ? payload.input : JSON.stringify(payload.input, null, 2)}
              </pre>
            </div>
          )}

          {payload.output != null && (
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Output</p>
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-zinc-50 px-2 py-1 font-mono text-xs text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
                {typeof payload.output === 'string' ? payload.output : JSON.stringify(payload.output, null, 2)}
              </pre>
            </div>
          )}

          {!payload.input && !payload.output && !command && (
            <pre className="max-h-32 overflow-auto font-mono text-xs text-zinc-600 dark:text-zinc-400">
              {JSON.stringify(payload, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
