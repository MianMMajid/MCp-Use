'use client'

import { useState, useMemo } from 'react'
import { useChat } from '@/contexts/chat-context'
import { Badge } from '@/components/badge'
import { statusColor } from '@/lib/format'
import { MagnifyingGlassIcon, CheckIcon } from '@heroicons/react/20/solid'
import { CpuChipIcon } from '@heroicons/react/24/outline'

export function AgentPalette({ nodes }) {
  const { agents } = useChat()
  const [search, setSearch] = useState('')

  const agentIdsOnCanvas = useMemo(
    () => new Set(nodes.map((n) => n.data?.agentId).filter(Boolean)),
    [nodes]
  )

  const filtered = useMemo(() => {
    if (!search) return agents
    const q = search.toLowerCase()
    return agents.filter((a) =>
      (a.name ?? '').toLowerCase().includes(q) ||
      (a.description ?? '').toLowerCase().includes(q)
    )
  }, [agents, search])

  const onDragStart = (e, agentId) => {
    e.dataTransfer.setData('application/orchestration-agent', agentId)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Agents
        </h3>
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800/50">
          <MagnifyingGlassIcon className="h-3.5 w-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-white"
          />
        </div>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.map((agent) => {
          const id = agent.agentId ?? agent.id
          const onCanvas = agentIdsOnCanvas.has(id)
          return (
            <div
              key={id}
              draggable
              onDragStart={(e) => onDragStart(e, id)}
              className={`
                mb-1 flex cursor-grab items-center gap-2 rounded-lg px-2.5 py-2 transition-colors
                ${onCanvas
                  ? 'bg-zinc-50 opacity-60 dark:bg-zinc-800/50'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                }
              `}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-orange-50 dark:bg-orange-900/20">
                <CpuChipIcon className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-zinc-900 dark:text-white">
                  {agent.name ?? id}
                </span>
                <Badge color={statusColor(agent.status)} className="mt-0.5 text-[8px]">
                  {agent.status ?? 'unknown'}
                </Badge>
              </div>
              {onCanvas && (
                <CheckIcon className="h-3.5 w-3.5 shrink-0 text-green-500" />
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <p className="py-4 text-center text-xs text-zinc-400">No agents found</p>
        )}
      </div>
    </div>
  )
}
