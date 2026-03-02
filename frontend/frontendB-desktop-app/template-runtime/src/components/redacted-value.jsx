'use client'

import { useState } from 'react'

export function RedactedValue({ value, label = 'secret' }) {
  const [revealed, setRevealed] = useState(false)

  if (!value) return <span className="text-zinc-400">--</span>

  return (
    <span className="inline-flex items-center gap-2">
      <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
        {revealed ? value : '\u2022'.repeat(Math.min(value.length, 24))}
      </code>
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        {revealed ? 'Hide' : 'Reveal'}
      </button>
    </span>
  )
}
