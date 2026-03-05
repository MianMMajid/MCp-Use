'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import clsx from 'clsx'
import { useChat } from '@/contexts/chat-context'
import { useShell } from '@/contexts/shell-context'
import { AgentSelector } from './agent-selector'
import { Avatar } from './avatar'
import { Badge } from './badge'
import { groupByDate, statusColor } from '@/lib/format'
import {
  Bars3Icon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentListIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'

function shortId(value) {
  if (!value) return '--'
  const text = String(value)
  return text.length <= 14 ? text : text.slice(0, 14)
}

export function ChatSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { toggleSidebar } = useShell()
  const {
    mode,
    sessions,
    sessionId,
    handleSelectSession,
    handleNewSession,
    selectedAgentId,
    sessionsLoading,
    orchestrations,
    orchestrationsLoading,
    selectedOrchestrationId,
    selectOrchestration,
  } = useChat()

  const [search, setSearch] = useState('')
  const [scrollTop, setScrollTop] = useState(0)

  const sortedSessions = useMemo(() => {
    const list = [...sessions].sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0))
    if (!search) return list
    const q = search.toLowerCase()
    return list.filter((session) => String(session.title ?? session.sessionId ?? '').toLowerCase().includes(q))
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

  function onSearchPillClick() {
    if (typeof window === 'undefined') return
    const promptLabel = mode === 'agent' ? 'Search chats' : 'Search orchestrations'
    const nextValue = window.prompt(promptLabel, search)
    if (nextValue !== null) setSearch(nextValue)
  }

  return (
    <aside className="h-screen max-h-[100dvh] min-h-screen select-none bg-gray-50/70 text-gray-900 dark:bg-gray-950/70 dark:text-gray-200">
      <div className="my-auto flex h-screen max-h-[100dvh] w-full flex-col justify-between overflow-x-hidden scrollbar-hidden">
        <div className="sidebar sticky top-0 z-10 -mb-3 flex justify-between space-x-1 px-[0.5625rem] pb-1.5 pt-2 text-gray-600 dark:text-gray-400">
          <div className="flex w-full items-center gap-1.5">
            <button
              className="flex size-8 items-center justify-center rounded-xl transition hover:bg-gray-100/50 dark:hover:bg-zinc-900/50"
              onClick={() => {
                handleNewSession()
                router.push('/?mode=agent')
              }}
              aria-label="New Chat"
            >
              <Avatar src="/maple-favicon.svg" className="size-5" />
            </button>
            <button
              className="flex min-w-0 flex-1 items-center rounded-xl px-1.5 py-1 text-left transition hover:bg-gray-100/50 dark:hover:bg-zinc-900/50"
              onClick={() => router.push('/')}
            >
              <span className="truncate text-sm font-medium text-zinc-900 dark:text-white">Mayple</span>
            </button>
            <button
              className="flex size-8 items-center justify-center rounded-xl transition hover:bg-gray-100/50 dark:hover:bg-zinc-900/50"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
            >
              <Bars3Icon className="h-4 w-4" />
            </button>
          </div>
          <div
            className={clsx(
              'pointer-events-none absolute inset-0 -z-10 -mb-6 bg-linear-to-b from-gray-50 to-transparent from-50% dark:from-gray-950',
              scrollTop > 0 ? 'visible' : 'invisible',
            )}
          />
        </div>

        <div
          className="relative flex min-h-0 flex-1 flex-col overflow-y-auto pb-3 pt-3 scrollbar-hidden"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop || 0)}
        >
          <div className="pb-1.5">
            <div className="px-[0.4375rem] text-gray-800 dark:text-gray-200">
              <div className="space-y-1">
                {[
                  {
                    key: 'agents',
                    label: 'Agents',
                    icon: ChatBubbleLeftRightIcon,
                    active: (pathname === '/' && mode === 'agent') || pathname.startsWith('/agents'),
                    onClick: () => router.push('/?mode=agent'),
                  },
                  {
                    key: 'builder',
                    label: 'Builder',
                    icon: Squares2X2Icon,
                    active: pathname.startsWith('/orchestrate'),
                    onClick: () => router.push('/orchestrate'),
                  },
                  {
                    key: 'tasks',
                    label: 'Tasks',
                    icon: ClipboardDocumentListIcon,
                    active: pathname.startsWith('/tasks'),
                    onClick: () => router.push('/tasks'),
                  },
                  {
                    key: 'new-chat',
                    label: 'New Chat',
                    icon: PencilSquareIcon,
                    active: false,
                    onClick: () => {
                      handleNewSession()
                      router.push('/?mode=agent')
                    },
                  },
                  {
                    key: 'search',
                    label: search ? `Search: ${search}` : 'Search',
                    icon: MagnifyingGlassIcon,
                    active: Boolean(search.trim()),
                    onClick: onSearchPillClick,
                  },
                ].map(({ key, label, icon: Icon, active, onClick }) => (
                  <button
                    key={key}
                    onClick={onClick}
                    className={clsx(
                      'group flex w-full items-center space-x-3 rounded-2xl px-2.5 py-2 text-left text-sm transition outline-none',
                      active
                        ? 'bg-gray-100 text-zinc-900 dark:bg-gray-900 dark:text-zinc-100'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-900',
                    )}
                  >
                    <div className="self-center">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="flex flex-1 self-center">
                      <div className="truncate self-center">{label}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-2 px-[0.4375rem]">
            {mode === 'agent' ? (
              <AgentSelector />
            ) : (
              <button
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-2.5 py-2 text-xs transition hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
                onClick={() => router.push('/orchestrate')}
              >
                <Squares2X2Icon className="h-4 w-4" />
                Open Builder
              </button>
            )}
          </div>

          <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-[0.4375rem] pb-2 scrollbar-hidden">
          {mode === 'agent' ? (
            <>
              {!selectedAgentId ? (
                <div className="flex h-full flex-col items-center justify-center py-8 text-center text-xs text-zinc-400">
                  <ChatBubbleLeftRightIcon className="h-8 w-8 text-zinc-300 dark:text-zinc-700" />
                  <p className="mt-2">Select an agent to start chatting</p>
                </div>
              ) : null}

              {selectedAgentId && sessionsLoading ? (
                <div className="flex justify-center py-4">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
                </div>
              ) : null}

              {selectedAgentId && !sessionsLoading && sortedSessions.length === 0 ? (
                <p className="py-5 text-center text-xs text-zinc-400">No conversations yet</p>
              ) : null}

              {groupedSessions.map(([label, items]) => (
                <div key={label} className="mb-3">
                  <p className="px-2 py-1 text-[10px] font-medium text-gray-500 dark:text-gray-500">{label}</p>
                  {items.map((session) => {
                    const sid = session.sessionId ?? session.id
                    const isActive = sid === sessionId
                    const title = session.title ?? sid?.slice(0, 28) ?? 'Untitled'
                    return (
                      <button
                        key={sid}
                        id="sidebar-chat-item"
                        onClick={() => {
                          handleSelectSession(sid)
                          router.push('/?mode=agent')
                        }}
                        className={clsx(
                          'mb-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition',
                          isActive
                            ? 'bg-gray-100 text-zinc-900 dark:bg-gray-900 dark:text-zinc-100'
                            : 'text-zinc-700 hover:bg-gray-100 dark:text-zinc-200 dark:hover:bg-gray-900',
                        )}
                      >
                        <ChatBubbleLeftRightIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="truncate">{title}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </>
          ) : (
            <>
              {orchestrationsLoading ? (
                <div className="flex justify-center py-4">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
                </div>
              ) : null}

              {!orchestrationsLoading && filteredOrchestrations.length === 0 ? (
                <p className="py-5 text-center text-xs text-zinc-400">No orchestrations found</p>
              ) : null}

              {filteredOrchestrations.map((orchestration) => {
                const id = String(orchestration.id || '')
                const active = id === String(selectedOrchestrationId || '')
                return (
                  <button
                    key={id}
                    onClick={() => {
                      selectOrchestration(id)
                      router.push(`/?mode=orchestration&orchestrationId=${encodeURIComponent(id)}`)
                    }}
                    className={clsx(
                      'mb-2 w-full rounded-2xl border px-3 py-2 text-left transition',
                      active
                        ? 'border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900'
                        : 'border-gray-200 bg-white hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate text-xs font-semibold">{orchestration.name || id}</span>
                      <Badge color={statusColor(orchestration.status || 'unknown')} className="text-[10px]">
                        {orchestration.status || 'unknown'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">{shortId(id)} · {(orchestration.nodes || []).length} nodes</p>
                  </button>
                )
              })}
            </>
          )}
          </div>
        </div>
      </div>
    </aside>
  )
}
