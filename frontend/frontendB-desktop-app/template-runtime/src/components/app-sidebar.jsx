'use client'

import { usePathname } from 'next/navigation'
import { _visitedPages } from '@/app/(app)/page-manager'
import {
  Sidebar,
  SidebarBody,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@/components/sidebar'
import { useShell } from '@/contexts/shell-context'
import {
  HomeIcon,
  CpuChipIcon,
  PlayCircleIcon,
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
  ShieldExclamationIcon,
  DocumentMagnifyingGlassIcon,
  ChartBarSquareIcon,
  Cog6ToothIcon,
} from '@heroicons/react/20/solid'

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/agents', label: 'Agents', icon: CpuChipIcon },
  { href: '/runs', label: 'Runs', icon: PlayCircleIcon },
  { href: '/approvals', label: 'Approvals', icon: ShieldCheckIcon },
  { href: '/tools', label: 'Tools', icon: WrenchScrewdriverIcon },
  { href: '/policies', label: 'Policies', icon: ShieldExclamationIcon },
  { href: '/audit', label: 'Audit / Traces', icon: DocumentMagnifyingGlassIcon },
  { href: '/reports', label: 'Reports', icon: ChartBarSquareIcon },
  { href: '/settings', label: 'Settings', icon: Cog6ToothIcon },
]

function sidebarClick(href) {
  return (e) => {
    if (_visitedPages.has(href)) {
      e.preventDefault()
      window.history.pushState({}, '', href)
    }
  }
}

export function AppSidebar() {
  const pathname = usePathname()
  const { sidebarCollapsed } = useShell()

  return (
    <Sidebar>
      <SidebarBody>
        <SidebarSection>
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const current = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <SidebarItem
                key={href}
                href={href}
                current={current}
                onClick={sidebarClick(href)}
              >
                <Icon />
                {!sidebarCollapsed && <SidebarLabel>{label}</SidebarLabel>}
              </SidebarItem>
            )
          })}
        </SidebarSection>
        <SidebarSpacer />
      </SidebarBody>
    </Sidebar>
  )
}

export { NAV_ITEMS }
