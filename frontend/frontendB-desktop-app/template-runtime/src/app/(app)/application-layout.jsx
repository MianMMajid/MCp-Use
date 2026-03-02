'use client'

import { useRouter } from 'next/navigation'
import { PageManager, _visitedPages } from './page-manager'
import { AppShell } from '@/components/app-shell'
import { NAV_ITEMS } from '@/components/app-sidebar'
import { useEffect } from 'react'

// Pre-cache all sidebar route RSC payloads on mount
const ALL_SIDEBAR_ROUTES = NAV_ITEMS.map((item) => item.href)

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
    <AppShell>
      <PageManager>{children}</PageManager>
    </AppShell>
  )
}
