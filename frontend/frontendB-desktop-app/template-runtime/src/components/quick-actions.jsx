'use client'

import { Link } from '@/components/link'
import {
  PlusCircleIcon,
  ShieldCheckIcon,
  PlayCircleIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/20/solid'

const ACTIONS = [
  { href: '/agents', icon: PlusCircleIcon, label: 'New Task', description: 'Start a new agent run' },
  { href: '/approvals', icon: ShieldCheckIcon, label: 'Review Approvals', description: 'Check pending decisions' },
  { href: '/runs', icon: PlayCircleIcon, label: 'View Runs', description: 'Monitor active runs' },
  { href: '/policies', icon: ShieldExclamationIcon, label: 'Check Policies', description: 'Review firewall rules' },
]

export function QuickActions() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {ACTIONS.map(({ href, icon: Icon, label, description }) => (
        <Link
          key={href}
          href={href}
          className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
        >
          <div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-800">
            <Icon className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-white">{label}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
          </div>
        </Link>
      ))}
    </div>
  )
}
