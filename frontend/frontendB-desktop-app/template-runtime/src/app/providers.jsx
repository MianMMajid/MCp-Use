'use client'

import { useLayoutEffect } from 'react'
import { FakeModeControl } from '@/components/fake-mode-control'
import { initializeFakeModeRuntime } from '@/lib/fake-mode/runtime'

export function Providers({ children }) {
  useLayoutEffect(() => {
    initializeFakeModeRuntime()
  }, [])

  return (
    <>
      {children}
      <FakeModeControl />
    </>
  )
}
