'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Input } from '@/components/input'
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/dropdown'
import { loadJson, postJson } from '@/lib/api'
import {
  MagnifyingGlassIcon,
  ChevronDownIcon,
} from '@heroicons/react/20/solid'
import {
  ArrowRightStartOnRectangleIcon,
  Cog8ToothIcon,
} from '@heroicons/react/16/solid'

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
    <span className="relative flex h-2.5 w-2.5" title={`Gateway: ${status}`}>
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${color}`} />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
  )
}

function GlobalSearch() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])

  const doSearch = useCallback((q) => {
    if (!q.trim()) { setResults([]); return }
    loadJson(`/api/search?q=${encodeURIComponent(q)}&types=agents,runs,traces`)
      .then((data) => setResults(data?.results ?? []))
      .catch(() => setResults([]))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 300)
    return () => clearTimeout(t)
  }, [query, doSearch])

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <MagnifyingGlassIcon className="h-4 w-4 text-zinc-400" />
        <Input
          type="text"
          placeholder="Search agents, executions, traces..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSearchOpen(true) }}
          onFocus={() => setSearchOpen(true)}
          className="w-64 text-sm"
        />
      </div>
      {searchOpen && results.length > 0 && (
        <div className="absolute top-full left-0 z-50 mt-1 w-96 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          {results.slice(0, 8).map((r) => (
            <a
              key={`${r.type}-${r.id}`}
              href={r.type === 'agent'
                ? `/agents/${r.id}`
                : r.type === 'run'
                  ? `/?mode=orchestration&executionId=${encodeURIComponent(r.id)}&panel=timeline`
                  : r.type === 'orchestration'
                    ? `/?mode=orchestration&orchestrationId=${encodeURIComponent(r.id)}`
                    : '/orchestrate'}
              className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              onClick={() => setSearchOpen(false)}
            >
              <Badge color={r.type === 'agent' ? 'indigo' : r.type === 'run' ? 'green' : 'zinc'}>
                {r.type}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-900 dark:text-white">{r.title}</div>
                <div className="truncate text-xs text-zinc-500">{r.description}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

async function handleSignOut(router) {
  try { await postJson('/api/auth/logout', {}) } catch {}
  router.push('/login')
}

export function TopBar() {
  const router = useRouter()

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
      {/* Logo + Workspace */}
      <div className="flex items-center gap-3">
        <Dropdown>
          <DropdownButton className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <Avatar src="/maple-favicon.svg" className="size-6" />
            <span className="text-sm font-semibold text-zinc-900 dark:text-white">Mayple</span>
            <ChevronDownIcon className="h-4 w-4 text-zinc-400" />
          </DropdownButton>
          <DropdownMenu anchor="bottom start" className="min-w-56">
            <DropdownItem href="/">
              <Avatar slot="icon" src="/maple-favicon.svg" />
              <DropdownLabel>Mayple Desktop</DropdownLabel>
            </DropdownItem>
            <DropdownItem href="/settings">
              <Cog8ToothIcon />
              <DropdownLabel>Settings</DropdownLabel>
            </DropdownItem>
            <DropdownDivider />
            <DropdownItem onClick={() => handleSignOut(router)}>
              <ArrowRightStartOnRectangleIcon />
              <DropdownLabel>Sign out</DropdownLabel>
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>

      {/* Search */}
      <div className="hidden flex-1 lg:flex lg:justify-center">
        <GlobalSearch />
      </div>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-3">
        <HealthDot />
      </div>
    </header>
  )
}
