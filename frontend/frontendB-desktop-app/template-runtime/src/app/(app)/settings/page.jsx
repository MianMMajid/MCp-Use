'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Heading } from '@/components/heading'
import { TabBar, TabPanel } from '@/components/tab-bar'
import { SkeletonList } from '@/components/skeleton'

const AccountTab = dynamic(() => import('./account-tab'), { loading: () => <SkeletonList /> })
const BillingTab = dynamic(() => import('../../(app)/billing/page'), { loading: () => <SkeletonList /> })
const UsageTab = dynamic(() => import('../../(app)/usage/page'), { loading: () => <SkeletonList /> })
const IntegrationsTab = dynamic(() => import('../../(app)/integrations/page'), { loading: () => <SkeletonList /> })
const ApiKeysTab = dynamic(() => import('../../(app)/api-keys/page'), { loading: () => <SkeletonList /> })
const ServiceAccountsTab = dynamic(() => import('../../(app)/service-accounts/page'), { loading: () => <SkeletonList /> })
const DiagnosticsTab = dynamic(() => import('../../(app)/diagnostics/page'), { loading: () => <SkeletonList /> })

const TAB_NAMES = [
  'Account', 'Billing', 'Usage', 'Integrations',
  'API Keys', 'Service Accounts', 'Developer', 'Diagnostics',
]

const TAB_KEYS = [
  'account', 'billing', 'usage', 'integrations',
  'api-keys', 'service-accounts', 'developer', 'diagnostics',
]

function SettingsInner() {
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') ?? 'account'
  const defaultIndex = useMemo(() => {
    const idx = TAB_KEYS.indexOf(tab)
    return idx >= 0 ? idx : 0
  }, [tab])

  return (
    <>
      <Heading>Settings</Heading>
      <div className="mt-6">
        <TabBar tabs={TAB_NAMES} defaultIndex={defaultIndex}>
          <TabPanel><AccountTab /></TabPanel>
          <TabPanel><BillingTab /></TabPanel>
          <TabPanel><UsageTab /></TabPanel>
          <TabPanel><IntegrationsTab /></TabPanel>
          <TabPanel><ApiKeysTab /></TabPanel>
          <TabPanel><ServiceAccountsTab /></TabPanel>
          <TabPanel>
            <div className="space-y-4">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Developer tools: Agent Chat, CLI Tools, Community, and Demo Playground are available here.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <a href="/agent-chat" className="rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  <p className="font-medium text-zinc-900 dark:text-white">Agent Chat</p>
                  <p className="text-xs text-zinc-500">Interactive agent conversation</p>
                </a>
                <a href="/cli-tools" className="rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  <p className="font-medium text-zinc-900 dark:text-white">CLI Tools</p>
                  <p className="text-xs text-zinc-500">Command line utilities</p>
                </a>
                <a href="/community" className="rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  <p className="font-medium text-zinc-900 dark:text-white">Community</p>
                  <p className="text-xs text-zinc-500">Shared traces and playbooks</p>
                </a>
                <a href="/demo" className="rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  <p className="font-medium text-zinc-900 dark:text-white">Demo Playground</p>
                  <p className="text-xs text-zinc-500">Try out agent capabilities</p>
                </a>
              </div>
            </div>
          </TabPanel>
          <TabPanel><DiagnosticsTab /></TabPanel>
        </TabBar>
      </div>
    </>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SkeletonList />}>
      <SettingsInner />
    </Suspense>
  )
}
