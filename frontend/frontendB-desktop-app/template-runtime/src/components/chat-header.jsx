'use client'

import { useChat } from '@/contexts/chat-context'
import { useShell } from '@/contexts/shell-context'
import { Badge } from './badge'
import { statusColor } from '@/lib/format'
import { Bars3Icon, BoltIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'

export function ChatHeader({ onToggleMobileSidebar }) {
  const { selectedAgent, selectedAgentId, traceOpen, toggleTrace } = useChat()
  const { toggleSidebar, sidebarCollapsed } = useShell()

  const agentName = selectedAgent?.name ?? (selectedAgentId ? `Agent ${selectedAgentId.substring(0, 8)}` : null)
  const agentStatus = selectedAgent?.status ?? 'unknown'

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
      {/* Mobile hamburger */}
      <button
        onClick={onToggleMobileSidebar}
        className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 lg:hidden dark:hover:bg-zinc-800"
      >
        <Bars3Icon className="h-5 w-5" />
      </button>

      {/* Desktop sidebar toggle */}
      <button
        onClick={toggleSidebar}
        className="hidden rounded-md p-1 text-zinc-500 hover:bg-zinc-100 lg:block dark:hover:bg-zinc-800"
        title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        <Bars3Icon className="h-5 w-5" />
      </button>

      {/* Agent info - center */}
      <div className="flex flex-1 items-center justify-center gap-2">
        {agentName ? (
          <>
            <span className="text-sm font-medium text-zinc-900 dark:text-white">{agentName}</span>
            <Badge color={statusColor(agentStatus)} className="text-[10px]">{agentStatus}</Badge>
          </>
        ) : (
          <span className="text-sm text-zinc-400">No agent selected</span>
        )}
      </div>

      {/* Trace toggle */}
      <button
        onClick={toggleTrace}
        className={clsx(
          'rounded-md p-1.5 transition-colors',
          traceOpen
            ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
            : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        )}
        title={traceOpen ? 'Hide trace panel' : 'Show trace panel'}
      >
        <BoltIcon className="h-4 w-4" />
      </button>
    </div>
  )
}
