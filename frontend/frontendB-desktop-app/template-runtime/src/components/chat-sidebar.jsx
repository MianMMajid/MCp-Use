'use client'

import { useState, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useChat } from '@/contexts/chat-context'
import { useShell } from '@/contexts/shell-context'
import { AgentSelector } from './agent-selector'
import { Avatar } from './avatar'
import { Badge } from './badge'
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from './dropdown'
import { groupByDate, formatDate } from '@/lib/format'
import { loadJson, postJson } from '@/lib/api'
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import {
  CpuChipIcon,
  PlayCircleIcon,
  Cog6ToothIcon,
  ChatBubbleLeftRightIcon,
  ShareIcon,
} from '@heroicons/react/24/outline'
import {
  BellIcon,
  ArrowRightStartOnRectangleIcon,
  UserCircleIcon,
} from '@heroicons/react/16/solid'
import { useEffect } from 'react'
import clsx from 'clsx'

function HealthDot() {
  const [status, setStatus] = useState('unknown')

  useEffect(() => {
    let mounted = true
    const check = () => {
      loadJson('/api/firewall/state')
        .then((data) => mounted && setStatus(data?.ok ? 'ok' : 'degraded'))
        .catch(() => mounted && setStatus('error'))
    }
    check()
    const id = setInterval(check, 30_000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  const color = status === 'ok' ? 'bg-green-500' : status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <span className="relative flex h-2 w-2" title={`Gateway: ${status}`}>
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${color}`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  )
}

function NotificationsBell() {
  const { notificationCount, setNotificationCount } = useShell()

  useEffect(() => {
    let mounted = true
    const poll = () => {
      loadJson('/api/notifications/unread-count')
        .then((data) => mounted && setNotificationCount(data?.count ?? 0))
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, 15_000)
    return () => { mounted = false; clearInterval(id) }
  }, [setNotificationCount])

  return (
    <button
      className="relative rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
      title="Notifications"
    >
      <BellIcon className="h-4 w-4" />
      {notificationCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
          {notificationCount > 99 ? '99+' : notificationCount}
        </span>
      )}
    </button>
  )
}

export function ChatSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const {
    sessions,
    sessionId,
    handleSelectSession,
    handleNewSession,
    selectedAgentId,
    sessionsLoading,
  } = useChat()
  const [search, setSearch] = useState('')

  // Sort sessions by date descending
  const sortedSessions = useMemo(() => {
    const list = [...sessions].sort((a, b) =>
      new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0)
    )
    if (!search) return list
    return list.filter((s) => {
      const title = s.title ?? s.sessionId ?? ''
      return title.toLowerCase().includes(search.toLowerCase())
    })
  }, [sessions, search])

  const grouped = useMemo(
    () => groupByDate(sortedSessions, 'createdAt'),
    [sortedSessions]
  )

  const navItems = [
    { href: '/agents', label: 'Agents', icon: CpuChipIcon },
    { href: '/runs', label: 'Runs', icon: PlayCircleIcon },
    { href: '/orchestrate', label: 'Orchestrate', icon: ShareIcon },
    { href: '/settings', label: 'Settings', icon: Cog6ToothIcon },
  ]

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-900">
      {/* Logo header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <Avatar src="/teams/maple.svg" className="size-6" />
        <span className="text-sm font-semibold text-zinc-900 dark:text-white">Maple</span>
      </div>

      {/* New Chat button */}
      <div className="px-3 pb-2">
        <button
          onClick={() => {
            handleNewSession()
            if (pathname !== '/') router.push('/')
          }}
          className={clsx(
            'flex w-full items-center gap-2 rounded-lg px-3 py-2',
            'text-sm font-medium',
            'border border-zinc-200 dark:border-zinc-700',
            'text-zinc-700 dark:text-zinc-300',
            'hover:bg-zinc-50 dark:hover:bg-zinc-800',
            'transition-colors'
          )}
        >
          <PlusIcon className="h-4 w-4" />
          New Chat
        </button>
      </div>

      {/* Agent selector */}
      <AgentSelector />

      {/* Search bar */}
      {selectedAgentId && (
        <div className="mt-2 px-3">
          <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/50">
            <MagnifyingGlassIcon className="h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-white"
            />
          </div>
        </div>
      )}

      {/* Session list */}
      <div className="mt-2 flex-1 overflow-y-auto px-2">
        {!selectedAgentId && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ChatBubbleLeftRightIcon className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            <p className="mt-2 text-xs text-zinc-400">Select an agent to start chatting</p>
          </div>
        )}

        {selectedAgentId && sessionsLoading && (
          <div className="flex justify-center py-4">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
          </div>
        )}

        {selectedAgentId && !sessionsLoading && sortedSessions.length === 0 && (
          <div className="py-4 text-center text-xs text-zinc-400">
            No conversations yet
          </div>
        )}

        {grouped.map(([label, items]) => (
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
                    if (pathname !== '/') router.push('/')
                  }}
                  className={clsx(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left',
                    'text-sm transition-colors',
                    isActive
                      ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white'
                      : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/50'
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

      {/* Bottom nav */}
      <div className="border-t border-zinc-200 dark:border-zinc-800">
        {/* Nav icons */}
        <div className="flex items-center justify-around px-2 py-2">
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
                    ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white'
                    : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
                )}
                >
                <Icon className="h-5 w-5" />
              </button>
            )
          })}
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <HealthDot />
            <span className="text-[10px] text-zinc-400">online</span>
          </div>
          <NotificationsBell />
          <Dropdown>
            <DropdownButton className="rounded-md p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <Avatar src="/users/erica.jpg" className="size-6" square />
            </DropdownButton>
            <DropdownMenu anchor="top end" className="min-w-48">
              <DropdownItem href="/settings">
                <UserCircleIcon />
                <DropdownLabel>My account</DropdownLabel>
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem onClick={() => { postJson('/api/auth/logout', {}).catch(() => {}); router.push('/login') }}>
                <ArrowRightStartOnRectangleIcon />
                <DropdownLabel>Sign out</DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      </div>
    </div>
  )
}
