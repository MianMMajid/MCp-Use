'use client'

import { useState, Fragment } from 'react'
import { Listbox as HeadlessListbox, ListboxButton, ListboxOptions, ListboxOption } from '@headlessui/react'
import { ChevronUpDownIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { CpuChipIcon } from '@heroicons/react/24/outline'
import { useChat } from '@/contexts/chat-context'
import { Badge } from '@/components/badge'
import { statusColor } from '@/lib/format'
import { Link } from '@/components/link'
import clsx from 'clsx'

export function AgentSelector() {
  const { agents, selectedAgentId, selectAgent } = useChat()
  const [search, setSearch] = useState('')

  const filtered = search
    ? agents.filter((a) => (a.name ?? a.agentId ?? '').toLowerCase().includes(search.toLowerCase()))
    : agents

  const selected = agents.find((a) => (a.agentId ?? a.id) === selectedAgentId)

  return (
    <div className="px-3">
      <HeadlessListbox
        value={selectedAgentId}
        onChange={(id) => { selectAgent(id); setSearch('') }}
      >
        <ListboxButton
          className={clsx(
            'group flex w-full items-center gap-2 rounded-lg px-3 py-2',
            'text-left text-sm',
            'border border-zinc-200 dark:border-zinc-700',
            'bg-white dark:bg-zinc-800/50',
            'hover:bg-zinc-50 dark:hover:bg-zinc-800',
            'focus:outline-none focus:ring-2 focus:ring-orange-500'
          )}
        >
          <CpuChipIcon className="h-4 w-4 shrink-0 text-zinc-400" />
          <span className="flex-1 truncate text-zinc-900 dark:text-white">
            {selected ? (selected.name ?? selected.agentId) : 'Select an agent'}
          </span>
          {selected && (
            <span className={clsx(
              'h-2 w-2 rounded-full',
              selected.status === 'active' ? 'bg-green-500' : 'bg-zinc-400'
            )} />
          )}
          <ChevronUpDownIcon className="h-4 w-4 shrink-0 text-zinc-400" />
        </ListboxButton>

        <ListboxOptions
          anchor="bottom start"
          className={clsx(
            'z-50 w-[var(--button-width)] rounded-xl p-1',
            'bg-white/90 backdrop-blur-xl dark:bg-zinc-800/90',
            'shadow-lg ring-1 ring-zinc-950/10 dark:ring-white/10',
            'transition-opacity duration-100 data-closed:opacity-0',
            'max-h-64 overflow-y-auto'
          )}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-zinc-200 dark:border-zinc-700">
            <MagnifyingGlassIcon className="h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              className="flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-white"
            />
          </div>

          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-zinc-500">No agents found</div>
          )}

          {filtered.map((agent) => {
            const id = agent.agentId ?? agent.id
            return (
              <ListboxOption
                key={id}
                value={id}
                className={clsx(
                  'flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer',
                  'text-sm text-zinc-900 dark:text-white',
                  'data-focus:bg-orange-500 data-focus:text-white',
                  'data-selected:font-medium'
                )}
              >
                <CpuChipIcon className="h-4 w-4 shrink-0 text-zinc-400 data-focus:text-white" />
                <span className="flex-1 truncate">{agent.name ?? id}</span>
                <Badge color={statusColor(agent.status ?? 'unknown')} className="text-[10px]">
                  {agent.status ?? 'unknown'}
                </Badge>
              </ListboxOption>
            )
          })}

          {/* Manage agents link */}
          <div className="border-t border-zinc-200 dark:border-zinc-700 mt-1 pt-1">
            <Link
              href="/agents"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              Manage agents &rarr;
            </Link>
          </div>
        </ListboxOptions>
      </HeadlessListbox>
    </div>
  )
}
