'use client'

import { useState, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useChat } from '@/contexts/chat-context'
import { AgentSelector } from './agent-selector'
import { Avatar } from './avatar'
import { Badge } from './badge'
import { groupByDate, statusColor } from '@/lib/format'
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import {
  CpuChipIcon,
  Cog6ToothIcon,
  ChatBubbleLeftRightIcon,
  ShareIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

function shortId(value) {
  if (!value) return '--'
  const text = String(value)
  return text.length <= 14 ? text : text.slice(0, 14)
}

export function ChatSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const {
    mode,
    selectMode,

    // Agent mode
    sessions,
    sessionId,
    handleSelectSession,
    handleNewSession,
    selectedAgentId,
    sessionsLoading,

    // Orchestration mode
    orchestrations,
    orchestrationsLoading,
    selectedOrchestrationId,
    selectOrchestration,
  } = useChat()

  const [search, setSearch] = useState('')

  const sortedSessions = useMemo(() => {
    const list = [...sessions].sort((a, b) =>
      new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0),
    )
    if (!search) return list
    return list.filter((session) => {
      const title = session.title ?? session.sessionId ?? ''
      return title.toLowerCase().includes(search.toLowerCase())
    })
  }, [sessions, search])

  const groupedSessions = useMemo(() => groupByDate(sortedSessions, 'createdAt'), [sortedSessions])

  const filteredOrchestrations = useMemo(() => {
    const items = Array.isArray(orchestrations) ? orchestrations : []
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter((item) =>
      String(item.name || '').toLowerCase().includes(q) ||
      String(item.description || '').toLowerCase().includes(q),
    )
  }, [orchestrations, search])

  const navItems = [
    { href: '/agents', label: 'Agents', icon: CpuChipIcon },
    { href: '/orchestrate', label: 'Builder', icon: ShareIcon },
    { href: '/settings', label: 'Settings', icon: Cog6ToothIcon },
  ]

  function activateAgentMode() {
    selectMode('agent')
    if (pathname !== '/') router.push('/?mode=agent')
  }

  function activateOrchestrationMode() {
    selectMode('orchestration')
    if (pathname !== '/') router.push('/?mode=orchestration')
  }

  function handleSelectOrchestration(orchestrationId) {
    selectOrchestration(orchestrationId)
    if (pathname !== '/') {
      router.push(`/?mode=orchestration&orchestrationId=${encodeURIComponent(orchestrationId)}`)
    }
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/60 bg-white/45 shadow-xl backdrop-blur-xl supports-[backdrop-filter]:bg-white/35 dark:border-white/10 dark:bg-zinc-900/45 dark:supports-[backdrop-filter]:bg-zinc-900/40">
      <div className="flex items-center gap-2 px-4 py-3">
        <Avatar src="/maple-favicon.svg" className="size-6" />
        <span className="text-sm font-semibold text-zinc-900 dark:text-white">Mayple</span>
      </div>

      <div className="px-3 pb-2">
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-200/80 bg-white/70 p-1 dark:border-zinc-700/80 dark:bg-zinc-900/60">
          <button
            onClick={activateAgentMode}
            className={clsx(
              'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
              mode === 'agent'
                ? 'bg-orange-500 text-white'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
            )}
          >
            Agent
          </button>
          <button
            onClick={activateOrchestrationMode}
            className={clsx(
              'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
              mode === 'orchestration'
                ? 'bg-orange-500 text-white'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
            )}
          >
            Orchestration
          </button>
        </div>
      </div>

      {mode === 'agent' ? (
        <>
          <div className="px-3 pb-2">
            <button
              onClick={() => {
                handleNewSession()
                if (pathname !== '/') router.push('/?mode=agent')
              }}
              className={clsx(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2',
                'text-sm font-medium',
                'border border-zinc-200 dark:border-zinc-700',
                'text-zinc-700 dark:text-zinc-300',
                'hover:bg-zinc-50 dark:hover:bg-zinc-800',
                'transition-colors',
              )}
            >
              <PlusIcon className="h-4 w-4" />
              New Chat
            </button>
          </div>

          <AgentSelector />

          {selectedAgentId ? (
            <div className="mt-2 px-3">
              <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/50">
                <MagnifyingGlassIcon className="h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="flex-1 bg-transparent text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-white"
                />
              </div>
            </div>
          ) : null}

          <div className="mt-2 flex-1 overflow-y-auto px-2">
            {!selectedAgentId ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <ChatBubbleLeftRightIcon className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
                <p className="mt-2 text-xs text-zinc-400">Select an agent to start chatting</p>
              </div>
            ) : null}

            {selectedAgentId && sessionsLoading ? (
              <div className="flex justify-center py-4">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
              </div>
            ) : null}

            {selectedAgentId && !sessionsLoading && sortedSessions.length === 0 ? (
              <div className="py-4 text-center text-xs text-zinc-400">No conversations yet</div>
            ) : null}

            {groupedSessions.map(([label, items]) => (
              <div key={label} className="mb-2">
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {label}
                </div>
                {items.map((session) => {
                  const sid = session.sessionId ?? session.id
                  const isActive = sid === sessionId
                  const title = session.title ?? sid?.substring(0, 24) ?? 'Untitled'
                  return (
                    <button
                      key={sid}
                      onClick={() => {
                        handleSelectSession(sid)
                        if (pathname !== '/') router.push('/?mode=agent')
                      }}
                      className={clsx(
                        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left',
                        'text-sm transition-colors',
                        isActive
                          ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white'
                          : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/50',
                      )}
                    >
                      <ChatBubbleLeftRightIcon className="h-4 w-4 shrink-0 opacity-50" />
                      <span className="flex-1 truncate text-xs">{title}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="px-3 pb-2">
            <button
              onClick={() => router.push('/orchestrate')}
              className={clsx(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2',
                'text-sm font-medium',
                'border border-zinc-200 dark:border-zinc-700',
                'text-zinc-700 dark:text-zinc-300',
                'hover:bg-zinc-50 dark:hover:bg-zinc-800',
                'transition-colors',
              )}
            >
              <Squares2X2Icon className="h-4 w-4" />
              Open Builder Library
            </button>
          </div>

          <div className="px-3">
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/50">
              <MagnifyingGlassIcon className="h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Search orchestrations..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="flex-1 bg-transparent text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-white"
              />
            </div>
          </div>

          <div className="mt-2 flex-1 overflow-y-auto px-2">
            {orchestrationsLoading ? (
              <div className="flex justify-center py-4">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
              </div>
            ) : null}

            {!orchestrationsLoading && filteredOrchestrations.length === 0 ? (
              <div className="py-4 text-center text-xs text-zinc-400">No orchestrations yet</div>
            ) : null}

            {filteredOrchestrations.map((orchestration) => {
              const id = String(orchestration.id || '')
              const isActive = id === String(selectedOrchestrationId || '')
              return (
                <button
                  key={id}
                  onClick={() => handleSelectOrchestration(id)}
                  className={clsx(
                    'mb-2 flex w-full flex-col rounded-lg border px-3 py-2 text-left transition-colors',
                    isActive
                      ? 'border-orange-300 bg-orange-50/90 dark:border-orange-700 dark:bg-orange-900/20'
                      : 'border-zinc-200 bg-white/70 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:bg-zinc-800/70',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-zinc-900 dark:text-white">{orchestration.name || id}</span>
                    <Badge color={statusColor(orchestration.status || 'unknown')}>{orchestration.status || 'unknown'}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {shortId(id)} · {(orchestration.nodes || []).length} nodes
                  </p>
                </button>
              )
            })}
          </div>
        </>
      )}

      <div className="border-t border-zinc-900/10 dark:border-white/10">
        <div className="flex items-center justify-around px-2 py-3">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href)
            return (
              <button
                key={href}
                onClick={() => router.push(href)}
                title={label}
                className={clsx(
                  'relative rounded-lg p-2 transition-colors',
                  isActive
                    ? 'bg-white/80 text-zinc-900 shadow-sm dark:bg-zinc-800/80 dark:text-white'
                    : 'text-zinc-500 hover:bg-white/70 hover:text-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100',
                )}
              >
                <Icon className="h-5 w-5" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
