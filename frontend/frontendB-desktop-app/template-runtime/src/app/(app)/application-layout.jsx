'use client'

import { useRouter } from 'next/navigation'
import { PageManager } from './page-manager'
import { AppShell } from '@/components/app-shell'
import { ChatProvider } from '@/contexts/chat-context'
import { useEffect } from 'react'

const ALL_SIDEBAR_ROUTES = ['/', '/agents', '/runs', '/orchestrate', '/governance', '/settings']

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

export function ApplicationLayout({ events, children }) {
  useRoutePrefetch()

  return (
    <ChatProvider>
      <AppShell>
        <PageManager>{children}</PageManager>
      </AppShell>
    </ChatProvider>
  )
}
