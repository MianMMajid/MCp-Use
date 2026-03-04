'use client'

import {
  CpuChipIcon,
  PlayCircleIcon,
  Cog6ToothIcon,
  ShareIcon,
} from '@heroicons/react/20/solid'

export const NAV_ITEMS = [
  { href: '/agents', label: 'Agents', icon: CpuChipIcon },
  { href: '/runs', label: 'Runs', icon: PlayCircleIcon },
  { href: '/orchestrate', label: 'Orchestrate', icon: ShareIcon },
  { href: '/settings', label: 'Settings', icon: Cog6ToothIcon },
]

// Legacy export — sidebar rendering is now handled by ChatSidebar
export function AppSidebar() {
  return null
}
