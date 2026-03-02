'use client'

import { useEffect, useState } from 'react'
import { loadJson } from '@/lib/api'

export function HealthIndicator() {
  const [status, setStatus] = useState('unknown')

  useEffect(() => {
    let mounted = true
    const check = () => {
      loadJson('/api/firewall/state')
        .then((data) => mounted && setStatus(data?.ok ? 'ok' : 'degraded'))
        .catch(() => mounted && setStatus('error'))
    }
    check()
    const id = setInterval(check, 30_000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  const color = status === 'ok' ? 'bg-green-500' : status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
  const label = status === 'ok' ? 'Healthy' : status === 'degraded' ? 'Degraded' : 'Unavailable'

  return (
    <span className="inline-flex items-center gap-1.5" title={`Gateway: ${label}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
    </span>
  )
}
