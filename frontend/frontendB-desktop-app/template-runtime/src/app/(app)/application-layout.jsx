'use client'

import { useRouter } from 'next/navigation'
import { PageManager, _visitedPages } from './page-manager'
import { Avatar } from '@/components/avatar'
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/dropdown'
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from '@/components/navbar'
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@/components/sidebar'
import { SidebarLayout } from '@/components/sidebar-layout'
import { postJson } from '@/lib/api'

import {
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Cog8ToothIcon,
  LightBulbIcon,
  PlusIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from '@heroicons/react/16/solid'
import {
  Cog6ToothIcon,
  CreditCardIcon,
  HomeIcon,
  KeyIcon,
  LinkIcon,
  ChartBarIcon,
  QuestionMarkCircleIcon,
  ShieldCheckIcon as ShieldCheckIcon20,
  SparklesIcon,
  Square2StackIcon,
  TicketIcon,
  UserGroupIcon,
  ShieldExclamationIcon,
  ChatBubbleLeftRightIcon,
  PlayCircleIcon,
  WrenchScrewdriverIcon,
  ServerStackIcon,
  EyeIcon,
  AdjustmentsHorizontalIcon,
  ArrowsRightLeftIcon,
  BeakerIcon,
  CommandLineIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/20/solid'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

// Pre-cache all sidebar route RSC payloads on mount (works in dev mode unlike <Link prefetch>)
const ALL_SIDEBAR_ROUTES = [
  '/', '/events', '/sessions', '/runs', '/firewall', '/orders',
  '/modifier-approvals', '/modifier-observability', '/modifier-ops',
  '/tool-registry', '/downstream', '/diagnostics', '/cli-tools',
  '/agent-chat', '/community', '/demo', '/settings', '/billing',
  '/usage', '/integrations', '/organization', '/api-keys',
  '/service-accounts', '/profile', '/admin-console',
]

function useRoutePrefetch() {
  const router = useRouter()
  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      if (i >= ALL_SIDEBAR_ROUTES.length) { clearInterval(id); return }
      router.prefetch(ALL_SIDEBAR_ROUTES[i])
      i++
    }, 150)
    return () => clearInterval(id)
  }, [router])
}

// For sidebar links to visited pages: bypass Next.js RSC fetch, use pushState
function sidebarClick(href) {
  return (e) => {
    if (_visitedPages.has(href)) {
      e.preventDefault()
      window.history.pushState({}, '', href)
    }
  }
}

async function handleSignOut(router) {
  try {
    await postJson('/api/auth/logout', {})
  } catch {
    // proceed to redirect even if logout fails
  }
  router.push('/login')
}

function AccountDropdownMenu({ anchor, router }) {
  return (
    <DropdownMenu className="min-w-64" anchor={anchor}>
      <DropdownItem href="/profile">
        <UserCircleIcon />
        <DropdownLabel>My account</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem href="/settings">
        <ShieldCheckIcon />
        <DropdownLabel>Privacy policy</DropdownLabel>
      </DropdownItem>
      <DropdownItem href="/community">
        <LightBulbIcon />
        <DropdownLabel>Share feedback</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem href="/profile">
        <UserCircleIcon />
        <DropdownLabel>Profile</DropdownLabel>
      </DropdownItem>
      <DropdownItem href="/billing">
        <CreditCardIcon />
        <DropdownLabel>Billing</DropdownLabel>
      </DropdownItem>
      <DropdownItem href="/api-keys">
        <KeyIcon />
        <DropdownLabel>API Keys</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem onClick={() => handleSignOut(router)}>
        <ArrowRightStartOnRectangleIcon />
        <DropdownLabel>Sign out</DropdownLabel>
      </DropdownItem>
    </DropdownMenu>
  )
}

export function ApplicationLayout({ events, children }) {
  let pathname = usePathname()
  const router = useRouter()
  useRoutePrefetch()

  return (
    <SidebarLayout
      navbar={
        <Navbar>
          <NavbarSpacer />
          <NavbarSection>
            <Dropdown>
              <DropdownButton as={NavbarItem}>
                <Avatar src="/users/erica.jpg" square />
              </DropdownButton>
              <AccountDropdownMenu anchor="bottom end" router={router} />
            </Dropdown>
          </NavbarSection>
        </Navbar>
      }
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <Dropdown>
              <DropdownButton as={SidebarItem}>
                <Avatar src="/teams/maple.svg" />
                <SidebarLabel>Mayple Desktop</SidebarLabel>
                <ChevronDownIcon />
              </DropdownButton>
              <DropdownMenu className="min-w-80 lg:min-w-64" anchor="bottom start">
                <DropdownItem href="/settings">
                  <Cog8ToothIcon />
                  <DropdownLabel>Settings</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem href="/">
                  <Avatar slot="icon" src="/teams/maple.svg" />
                  <DropdownLabel>Mayple Desktop</DropdownLabel>
                </DropdownItem>
                <DropdownItem href="/organization">
                  <Avatar slot="icon" initials="BE" className="bg-purple-500 text-white" />
                  <DropdownLabel>Big Events</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem href="/organization">
                  <PlusIcon />
                  <DropdownLabel>New team&hellip;</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </SidebarHeader>

          <SidebarBody>
            {/* Core */}
            <SidebarSection>
              <SidebarHeading>Core</SidebarHeading>
              <SidebarItem href="/" current={pathname === '/'} onClick={sidebarClick('/')}>
                <HomeIcon />
                <SidebarLabel>Workspace</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/events" current={pathname.startsWith('/events')} onClick={sidebarClick('/events')}>
                <Square2StackIcon />
                <SidebarLabel>Agents</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/sessions" current={pathname.startsWith('/sessions')} onClick={sidebarClick('/sessions')}>
                <Square2StackIcon />
                <SidebarLabel>Sessions</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/runs" current={pathname.startsWith('/runs')} onClick={sidebarClick('/runs')}>
                <PlayCircleIcon />
                <SidebarLabel>Runs</SidebarLabel>
              </SidebarItem>
            </SidebarSection>

            {/* Security */}
            <SidebarSection>
              <SidebarHeading>Security</SidebarHeading>
              <SidebarItem href="/firewall" current={pathname.startsWith('/firewall')} onClick={sidebarClick('/firewall')}>
                <ShieldExclamationIcon />
                <SidebarLabel>Firewall</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/orders" current={pathname.startsWith('/orders')} onClick={sidebarClick('/orders')}>
                <TicketIcon />
                <SidebarLabel>Approvals</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/modifier-approvals" current={pathname.startsWith('/modifier-approvals')} onClick={sidebarClick('/modifier-approvals')}>
                <ShieldCheckIcon20 />
                <SidebarLabel>Modifier Approvals</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/modifier-observability" current={pathname.startsWith('/modifier-observability')} onClick={sidebarClick('/modifier-observability')}>
                <EyeIcon />
                <SidebarLabel>Observability</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/modifier-ops" current={pathname.startsWith('/modifier-ops')} onClick={sidebarClick('/modifier-ops')}>
                <AdjustmentsHorizontalIcon />
                <SidebarLabel>Modifier Ops</SidebarLabel>
              </SidebarItem>
            </SidebarSection>

            {/* Infrastructure */}
            <SidebarSection>
              <SidebarHeading>Infrastructure</SidebarHeading>
              <SidebarItem href="/tool-registry" current={pathname.startsWith('/tool-registry')} onClick={sidebarClick('/tool-registry')}>
                <WrenchScrewdriverIcon />
                <SidebarLabel>Tool Registry</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/downstream" current={pathname.startsWith('/downstream')} onClick={sidebarClick('/downstream')}>
                <ArrowsRightLeftIcon />
                <SidebarLabel>Downstream MCP</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/diagnostics" current={pathname.startsWith('/diagnostics')} onClick={sidebarClick('/diagnostics')}>
                <ServerStackIcon />
                <SidebarLabel>Diagnostics</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/cli-tools" current={pathname.startsWith('/cli-tools')} onClick={sidebarClick('/cli-tools')}>
                <CommandLineIcon />
                <SidebarLabel>CLI Tools</SidebarLabel>
              </SidebarItem>
            </SidebarSection>

            {/* AI & Community */}
            <SidebarSection>
              <SidebarHeading>AI & Community</SidebarHeading>
              <SidebarItem href="/agent-chat" current={pathname.startsWith('/agent-chat')} onClick={sidebarClick('/agent-chat')}>
                <ChatBubbleLeftRightIcon />
                <SidebarLabel>Agent Chat</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/community" current={pathname.startsWith('/community')} onClick={sidebarClick('/community')}>
                <SparklesIcon />
                <SidebarLabel>Community</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/demo" current={pathname.startsWith('/demo')} onClick={sidebarClick('/demo')}>
                <BeakerIcon />
                <SidebarLabel>Demo Playground</SidebarLabel>
              </SidebarItem>
            </SidebarSection>

            {/* Account */}
            <SidebarSection>
              <SidebarHeading>Account</SidebarHeading>
              <SidebarItem href="/settings" current={pathname.startsWith('/settings')} onClick={sidebarClick('/settings')}>
                <Cog6ToothIcon />
                <SidebarLabel>Account</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/billing" current={pathname.startsWith('/billing')} onClick={sidebarClick('/billing')}>
                <CreditCardIcon />
                <SidebarLabel>Billing</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/usage" current={pathname.startsWith('/usage')} onClick={sidebarClick('/usage')}>
                <ChartBarIcon />
                <SidebarLabel>Usage</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/integrations" current={pathname.startsWith('/integrations')} onClick={sidebarClick('/integrations')}>
                <LinkIcon />
                <SidebarLabel>Integrations</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/organization" current={pathname.startsWith('/organization')} onClick={sidebarClick('/organization')}>
                <UserGroupIcon />
                <SidebarLabel>Organization</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/api-keys" current={pathname.startsWith('/api-keys')} onClick={sidebarClick('/api-keys')}>
                <KeyIcon />
                <SidebarLabel>API Keys</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/service-accounts" current={pathname.startsWith('/service-accounts')} onClick={sidebarClick('/service-accounts')}>
                <KeyIcon />
                <SidebarLabel>Service Accounts</SidebarLabel>
              </SidebarItem>
            </SidebarSection>

            {/* Admin */}
            <SidebarSection>
              <SidebarHeading>Admin</SidebarHeading>
              <SidebarItem href="/admin-console" current={pathname.startsWith('/admin-console')} onClick={sidebarClick('/admin-console')}>
                <ClipboardDocumentListIcon />
                <SidebarLabel>Admin Console</SidebarLabel>
              </SidebarItem>
            </SidebarSection>

            <SidebarSection className="max-lg:hidden">
              <SidebarHeading>Active Agent Runs</SidebarHeading>
              {events.map((event) => (
                <SidebarItem key={event.id} href={event.url}>
                  {event.name}
                </SidebarItem>
              ))}
            </SidebarSection>

            <SidebarSpacer />

            <SidebarSection>
              <SidebarItem href="/diagnostics" current={pathname.startsWith('/diagnostics')} onClick={sidebarClick('/diagnostics')}>
                <QuestionMarkCircleIcon />
                <SidebarLabel>Support</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/community" current={pathname.startsWith('/community')} onClick={sidebarClick('/community')}>
                <SparklesIcon />
                <SidebarLabel>Release Notes</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
          </SidebarBody>

          <SidebarFooter className="max-lg:hidden">
            <Dropdown>
              <DropdownButton as={SidebarItem}>
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar src="/users/erica.jpg" className="size-10" square alt="" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm/5 font-medium text-zinc-950 dark:text-white">Erica</span>
                    <span className="block truncate text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
                      erica@example.com
                    </span>
                  </span>
                </span>
                <ChevronUpIcon />
              </DropdownButton>
              <AccountDropdownMenu anchor="top start" router={router} />
            </Dropdown>
          </SidebarFooter>
        </Sidebar>
      }
    >
      <PageManager>{children}</PageManager>
    </SidebarLayout>
  )
}
