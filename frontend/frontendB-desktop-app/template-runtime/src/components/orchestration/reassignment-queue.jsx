'use client'

import { Button } from '@/components/button'
import { Badge } from '@/components/badge'
import { formatDate } from '@/lib/format'

function statusColor(status) {
  if (status === 'scheduled') return 'indigo'
  if (status === 'applied') return 'green'
  if (status === 'canceled') return 'red'
  return 'zinc'
}

export function ReassignmentQueue({ items = [], disabled, onCancel }) {
  if (!items.length) {
    return <p className="text-xs text-zinc-500 dark:text-zinc-400">No timed reassignments queued.</p>
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 px-2 py-2 dark:border-zinc-700">
          <span className="font-mono text-[11px] text-zinc-500">{item.taskId}</span>
          <Badge color={statusColor(item.status)}>{item.status}</Badge>
          <span className="text-[11px] text-zinc-500">due {formatDate(item.dueAt)}</span>
          <span className="text-[11px] text-zinc-500">
            target {item.targetRole ? `role:${item.targetRole}` : `agent:${item.targetAgentId}`}
          </span>
          <span className="text-[11px] text-zinc-500">repeat {item.repeatIntervalMinutes || 0}m x{item.maxRepeats || 1}</span>
          <Button
            outline
            disabled={disabled || item.status !== 'scheduled'}
            onClick={() => onCancel(item.id)}
            className="ml-auto"
          >
            Cancel
          </Button>
        </div>
      ))}
    </div>
  )
}
