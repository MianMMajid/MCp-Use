'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import {
  CHANGE_EVENT,
  STORAGE_ENABLED_KEY,
  STORAGE_SEED_KEY,
  disableFakeMode,
  enableFakeMode,
  initializeFakeModeRuntime,
  regenerateFakeData,
} from '@/lib/fake-mode/runtime'

function readState() {
  if (typeof window === 'undefined') {
    return { enabled: false, seed: '' }
  }
  return {
    enabled: window.localStorage.getItem(STORAGE_ENABLED_KEY) === '1',
    seed: window.localStorage.getItem(STORAGE_SEED_KEY) || '',
  }
}

export function FakeModeControl() {
  const [state, setState] = useState(() => readState())

  useEffect(() => {
    initializeFakeModeRuntime()

    const refresh = () => setState(readState())
    const onChange = (event) => {
      const detail = event?.detail || {}
      setState({
        enabled: Boolean(detail.enabled),
        seed: detail.seed || '',
      })
    }

    window.addEventListener(CHANGE_EVENT, onChange)
    window.addEventListener('storage', refresh)

    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const seedLabel = useMemo(() => (state.seed ? state.seed.slice(-8) : 'none'), [state.seed])

  function handleEnable() {
    enableFakeMode()
    window.location.reload()
  }

  function handleDisable() {
    disableFakeMode()
    window.location.reload()
  }

  function handleRegenerate() {
    regenerateFakeData()
    window.location.reload()
  }

  return (
    <div className="pointer-events-none fixed top-3 right-3 z-[80]">
      <div className="pointer-events-auto rounded-2xl border border-zinc-950/10 bg-white/95 p-2 shadow-lg backdrop-blur dark:border-white/10 dark:bg-zinc-900/95">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Fake Mode</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${state.enabled ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/25 dark:text-orange-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'}`}>
            {state.enabled ? 'ON' : 'OFF'}
          </span>
        </div>

        {state.enabled ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="filled" onClick={handleRegenerate}>Regenerate Fake Data</Button>
            <Button variant="outline" onClick={handleDisable}>Use Real API</Button>
          </div>
        ) : (
          <Button variant="filled" onClick={handleEnable}>Enable Fake Data</Button>
        )}

        <p className="mt-2 px-1 text-[11px] text-zinc-500 dark:text-zinc-400">Seed: {seedLabel}</p>
      </div>
    </div>
  )
}
