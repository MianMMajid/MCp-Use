'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Heading } from '@/components/heading'
import { TabBar, TabPanel } from '@/components/tab-bar'
import { SkeletonList } from '@/components/skeleton'

const AccountTab = dynamic(() => import('./account-tab'), { loading: () => <SkeletonList /> })
const ApiKeysTab = dynamic(() => import('../../(app)/api-keys/page'), { loading: () => <SkeletonList /> })
const ServiceAccountsTab = dynamic(() => import('../../(app)/service-accounts/page'), { loading: () => <SkeletonList /> })
const SessionsTab = dynamic(() => import('../../(app)/sessions/page'), { loading: () => <SkeletonList /> })
const NotificationsTab = dynamic(() => import('./notifications-tab'), { loading: () => <SkeletonList /> })

const TAB_NAMES = [
  'Account',
  'API Keys',
  'Service Accounts',
  'Sessions',
  'Notifications',
]

const TAB_KEYS = [
  'account',
  'api-keys',
  'service-accounts',
  'sessions',
  'notifications',
]

function SettingsInner() {
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') ?? 'account'
  const defaultIndex = useMemo(() => {
    const idx = TAB_KEYS.indexOf(tab)
    return idx >= 0 ? idx : 0
  }, [tab])

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
      <Heading>Settings</Heading>
      <div className="mt-6">
        <TabBar tabs={TAB_NAMES} defaultIndex={defaultIndex}>
          <TabPanel><AccountTab /></TabPanel>
          <TabPanel><ApiKeysTab /></TabPanel>
          <TabPanel><ServiceAccountsTab /></TabPanel>
          <TabPanel><SessionsTab /></TabPanel>
          <TabPanel><NotificationsTab /></TabPanel>
        </TabBar>
      </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SkeletonList />}>
      <SettingsInner />
    </Suspense>
  )
}
