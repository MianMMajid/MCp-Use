'use client'

import { usePathname } from 'next/navigation'

import { MaypleOpsShell } from '@/components/workspace/MaypleOpsShell'
import { NavigationProgress } from '@/components/NavigationProgress'
import { SectionProvider } from '@/components/SectionProvider'

export function Layout({ children, allSections }) {
  let pathname = usePathname()

  // Render login page without sidebar/navigation
  if (pathname === '/login') {
    return <>{children}</>
  }

  return (
    <SectionProvider sections={allSections[pathname] ?? []}>
      <NavigationProgress />
      <MaypleOpsShell />
    </SectionProvider>
  )
}
