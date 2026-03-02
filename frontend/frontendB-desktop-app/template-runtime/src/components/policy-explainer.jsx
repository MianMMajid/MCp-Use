'use client'

import { useState } from 'react'
import { Badge } from '@/components/badge'
import { InformationCircleIcon } from '@heroicons/react/20/solid'

export function PolicyExplainer({ decision, rule, message, severity }) {
  const [open, setOpen] = useState(false)

  if (!decision && !rule) return null

  const allowed = decision === 'allow' || decision === 'allowed'

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <InformationCircleIcon className="h-4 w-4" />
        {allowed ? 'Why allowed' : 'Why blocked'}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <div className="flex items-center gap-2">
            <Badge color={allowed ? 'green' : 'red'}>{decision}</Badge>
            {severity && <Badge color={severity === 'high' || severity === 'critical' ? 'red' : 'zinc'}>{severity}</Badge>}
          </div>
          {rule && <p className="mt-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">Rule: {rule}</p>}
          {message && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{message}</p>}
        </div>
      )}
    </div>
  )
}
