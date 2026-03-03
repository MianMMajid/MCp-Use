'use client'

import { useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'

function withConsolePath(path) {
  const base = (process.env.NEXT_PUBLIC_PROTOCOL_CONSOLE_URL || '').trim().replace(/\/+$/, '')
  return base ? `${base}${path}` : path
}

const TAB_TO_PATH = {
  overview: '/maple/observability',
  policies: '/maple/audit',
  approvals: '/maple/audit',
  firewall: '/maple/observability',
  audit: '/maple/audit',
  'org-tenants': '/maple/audit',
  compliance: '/maple/audit',
  escalation: '/maple/audit',
}

export default function GovernancePage() {
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') || 'overview'
  const consolePath = TAB_TO_PATH[tab] || '/maple/observability'
  const href = useMemo(() => withConsolePath(consolePath), [consolePath])

  return (
    <div className="flex flex-1 items-center justify-center p-6 lg:p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <Heading>Governance Moved To Protocol Console</Heading>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          Governance, audit, compliance, retention, dead-letter, and webhook operations are now owned by Frontend A (Protocol).
          Frontend B (Catalyst) keeps orchestration authoring and runtime execution controls only.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button color="orange" href={href} target="_blank" rel="noreferrer">
            Open Protocol Console
          </Button>
          <Button outline href={withConsolePath('/maple/observability')} target="_blank" rel="noreferrer">
            Observability
          </Button>
          <Button outline href={withConsolePath('/maple/audit')} target="_blank" rel="noreferrer">
            Audit & Compliance
          </Button>
        </div>
      </div>
    </div>
  )
}
