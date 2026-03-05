'use client'

import { useState } from 'react'
import { Button } from '@/components/button'
import { postJson } from '@/lib/api'
import { StopIcon } from '@heroicons/react/20/solid'

export function StopButton({ sessionId, onStopped, compact = false }) {
  const [stopping, setStopping] = useState(false)

  async function handleStop() {
    if (!sessionId) return
    setStopping(true)
    try {
      await postJson(`/api/openclaw/agent/sessions/${sessionId}/cancel`, {})
      onStopped?.()
    } catch {
      // Ignore stop failures
    } finally {
      setStopping(false)
    }
  }

  return (
    <Button
      color="red"
      disabled={stopping || !sessionId}
      onClick={handleStop}
      className={compact ? '!rounded-full !px-3 !py-2' : 'gap-1 !rounded-full'}
    >
      <StopIcon className="h-4 w-4" />
      {compact ? <span className="sr-only">{stopping ? 'Stopping' : 'Stop run'}</span> : (stopping ? 'Stopping...' : 'Stop Run')}
    </Button>
  )
}
