'use client'

import { Suspense } from 'react'
import { MapleWorkspaceShell } from './MapleWorkspaceShell'

export function MaypleOpsShell() {
  return (
    <Suspense>
      <MapleWorkspaceShell />
    </Suspense>
  )
}
