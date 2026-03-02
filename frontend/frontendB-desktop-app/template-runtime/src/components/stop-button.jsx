'use client'

import { useState } from 'react'
import { Button } from '@/components/button'
import { postJson } from '@/lib/api'
import { StopIcon } from '@heroicons/react/20/solid'

export function StopButton({ sessionId, onStopped }) {
  const [stopping, setStopping] = useState(false)

  async function handleStop() {
    if (!sessionId) return
    setStopping(true)
    try {
      await postJson(`/api/openclaw/sessions/${sessionId}/cancel`, {})
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
      className="gap-1"
    >
      <StopIcon className="h-4 w-4" />
      {stopping ? 'Stopping...' : 'Stop Run'}
    </Button>
  )
}
