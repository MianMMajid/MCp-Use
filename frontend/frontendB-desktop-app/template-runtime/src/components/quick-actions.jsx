'use client'

import { Link } from '@/components/link'
import {
  PlusCircleIcon,
  ShareIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/20/solid'

const ACTIONS = [
  { href: '/agents', icon: PlusCircleIcon, label: 'New Agent', description: 'Create or select orchestration agents' },
  { href: '/orchestrate', icon: ShareIcon, label: 'Build Orchestration', description: 'Author and publish orchestration flows' },
  { href: '/?mode=orchestration', icon: ChatBubbleLeftRightIcon, label: 'Orchestration Chat', description: 'Start or steer execution loops from chat' },
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
