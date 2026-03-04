'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'

const ALL_PAGES = [
  { label: 'Home', href: '/', section: 'Pages' },
  { label: 'Agents', href: '/agents', section: 'Pages' },
  { label: 'Runs', href: '/runs', section: 'Pages' },
  { label: 'Orchestrate', href: '/orchestrate', section: 'Pages' },
  { label: 'Settings', href: '/settings', section: 'Pages' },
  { label: 'Settings — Account', href: '/settings?tab=account', section: 'Pages' },
  { label: 'Settings — API Keys', href: '/settings?tab=api-keys', section: 'Pages' },
  { label: 'Settings — Service Accounts', href: '/settings?tab=service-accounts', section: 'Pages' },
  { label: 'Settings — Sessions', href: '/settings?tab=sessions', section: 'Pages' },
  { label: 'Settings — Notifications', href: '/settings?tab=notifications', section: 'Pages' },
]

const QUICK_ACTIONS = [
  { label: 'New Chat', href: '/', section: 'Quick Actions', action: 'newChat' },
  { label: 'New Agent', href: '/agents', section: 'Quick Actions' },
  { label: 'New Orchestration', href: '/orchestrate', section: 'Quick Actions' },
]

export function CommandPalette({ open, onClose }) {
  const router = useRouter()
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    const items = [...ALL_PAGES, ...QUICK_ACTIONS]
    if (!q) return items
    return items.filter((item) => item.label.toLowerCase().includes(q))
  }, [query])

  const grouped = useMemo(() => {
    const map = {}
    for (const item of filtered) {
      if (!map[item.section]) map[item.section] = []
      map[item.section].push(item)
    }
    return Object.entries(map)
  }, [filtered])

  function handleSelect(item) {
    onClose()
    router.push(item.href)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault()
      handleSelect(filtered[0])
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition data-closed:opacity-0 data-enter:duration-200 data-leave:duration-150"
      />
      <div className="fixed inset-0 flex items-start justify-center p-4 pt-[15vh]">
        <DialogPanel
          transition
          className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-zinc-950/5 transition data-closed:scale-95 data-closed:opacity-0 data-enter:duration-200 data-leave:duration-150 dark:bg-zinc-900 dark:ring-white/10"
        >
          <div className="flex items-center gap-3 border-b border-zinc-200 px-4 dark:border-zinc-700">
            <MagnifyingGlassIcon className="h-5 w-5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search pages, actions..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-white"
              autoFocus
            />
            <kbd className="hidden rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 sm:inline dark:border-zinc-700">
              ESC
            </kbd>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {grouped.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-zinc-500">No results found.</p>
            )}
            {grouped.map(([section, items]) => (
              <div key={section}>
                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  {section}
                </p>
                {items.map((item) => (
                  <button
                    key={item.href + item.label}
                    onClick={() => handleSelect(item)}
                    className={clsx(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm',
                      'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
                      'transition-colors'
                    )}
                  >
                    <span className="flex-1">{item.label}</span>
                    <span className="text-xs text-zinc-400">{item.href.split('?')[0]}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
