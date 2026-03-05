'use client'

import { useChat } from '@/contexts/chat-context'
import { useShell } from '@/contexts/shell-context'
import { Badge } from './badge'
import { statusColor } from '@/lib/format'
import { Bars3Icon } from '@heroicons/react/20/solid'

export function ChatHeader({ onToggleMobileSidebar }) {
  const {
    mode,
    stackMode,
    selectedAgent,
    selectedAgentId,
    selectedOrchestration,
  } = useChat()
  const { toggleSidebar, sidebarCollapsed } = useShell()

  const agentName = selectedAgent?.name ?? (selectedAgentId ? `Agent ${selectedAgentId.substring(0, 8)}` : null)
  const agentStatus = selectedAgent?.status ?? 'unknown'
  const orchestrationName = selectedOrchestration?.name ?? null

  return (
    <div className="sticky top-0 z-20 flex h-11 shrink-0 items-center gap-2 border-b border-gray-200/80 bg-gray-50/90 px-3 dark:border-gray-800 dark:bg-gray-950/90">
      {/* Mobile hamburger */}
      <button
        onClick={onToggleMobileSidebar}
        className="rounded-xl p-1 text-zinc-500 transition hover:bg-gray-100 lg:hidden dark:hover:bg-gray-900"
      >
        <Bars3Icon className="h-5 w-5" />
      </button>

      {/* Desktop sidebar toggle */}
      <button
        onClick={toggleSidebar}
        className="hidden rounded-xl p-1 text-zinc-500 transition hover:bg-gray-100 lg:block dark:hover:bg-gray-900"
        title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        <Bars3Icon className="h-4.5 w-4.5" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Badge color={stackMode === 'backend' ? 'orange' : 'sky'} className="text-[10px]">
          {stackMode === 'backend' ? 'Backend Mode' : 'Frontend Mode'}
        </Badge>
        {mode === 'orchestration' ? (
          orchestrationName ? (
            <>
              <span className="truncate text-sm font-medium text-zinc-900 dark:text-white">{orchestrationName}</span>
              <Badge color="orange" className="text-[10px]">Orchestration</Badge>
            </>
          ) : (
            <span className="text-sm text-zinc-400">No orchestration selected</span>
          )
        ) : agentName ? (
          <>
            <span className="truncate text-sm font-medium text-zinc-900 dark:text-white">{agentName}</span>
            <Badge color={statusColor(agentStatus)} className="text-[10px]">{agentStatus}</Badge>
          </>
        ) : (
          <span className="text-sm text-zinc-400">No agent selected</span>
        )}
      </div>
    </div>
  )
}
