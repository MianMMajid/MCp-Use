'use client'

import {
  CpuChipIcon,
  Cog6ToothIcon,
  ShareIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/20/solid'

export const NAV_ITEMS = [
  { href: '/agents', label: 'Agents', icon: CpuChipIcon },
  { href: '/?mode=orchestration', label: 'Orchestration Chat', icon: ChatBubbleLeftRightIcon },
  { href: '/orchestrate', label: 'Orchestrate', icon: ShareIcon },
  { href: '/settings', label: 'Settings', icon: Cog6ToothIcon },
]

// Legacy export — sidebar rendering is now handled by ChatSidebar
export function AppSidebar() {
  return null
}
