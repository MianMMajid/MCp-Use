'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { loadJson, postJson } from '@/lib/api'
import { BellIcon } from '@heroicons/react/20/solid'
import { formatDate } from '@/lib/format'

export function NotificationsBell() {
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])

  useEffect(() => {
    let mounted = true
    const poll = () => {
      loadJson('/api/notifications/unread-count')
        .then((data) => mounted && setCount(data?.count ?? 0))
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, 15_000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  async function handleOpen() {
    setOpen((v) => !v)
    if (!open) {
      try {
        const data = await loadJson('/api/notifications?limit=10')
        setItems(data?.items ?? [])
      } catch {
        setItems([])
      }
    }
  }

  async function markRead(id) {
    await postJson(`/api/notifications/${id}/read`, {}).catch(() => {})
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setCount((prev) => Math.max(0, prev - 1))
  }

  async function markAllRead() {
    await postJson('/api/notifications/read-all', {}).catch(() => {})
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    setCount(0)
  }

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative rounded-md p-1.5 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <BellIcon className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
            <p className="text-sm font-medium text-zinc-900 dark:text-white">Notifications</p>
            {count > 0 && (
              <button onClick={markAllRead} className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-zinc-400">No notifications</p>
            )}
            {items.map((notif) => (
              <div
                key={notif.id}
                onClick={() => !notif.read && markRead(notif.id)}
                className={`cursor-pointer border-b border-zinc-100 px-3 py-2 last:border-0 dark:border-zinc-700 ${
                  notif.read ? '' : 'bg-orange-50/50 dark:bg-orange-950/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-zinc-900 dark:text-white">{notif.title}</p>
                  <Badge color={notif.read ? 'zinc' : 'orange'} className="text-[10px]">{notif.type}</Badge>
                </div>
                {notif.body && <p className="mt-0.5 text-xs text-zinc-500">{notif.body}</p>}
                <p className="mt-0.5 text-[10px] text-zinc-400">{formatDate(notif.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
