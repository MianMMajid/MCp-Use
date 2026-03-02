'use client'

import { useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { postJson } from '@/lib/api'

const REPORTS = [
  {
    id: 'usage',
    title: 'Usage Report',
    description: 'Agent execution metrics, token usage, and cost breakdown.',
    endpoint: '/api/openclaw/modifier/observability/siem-export',
    body: { format: 'json' },
  },
  {
    id: 'compliance',
    title: 'Compliance Report',
    description: 'SOC2-ready audit trail export with policy decisions and approval records.',
    endpoint: '/api/openclaw/modifier/observability/siem-export',
    body: { format: 'cef' },
  },
  {
    id: 'siem',
    title: 'SIEM Export',
    description: 'Security events in CEF/JSON format for SIEM integration.',
    endpoint: '/api/openclaw/modifier/observability/siem-export',
    body: { format: 'cef' },
  },
]

export default function ReportsPage() {
  const [generating, setGenerating] = useState({})
  const [message, setMessage] = useState('')

  async function handleGenerate(report) {
    setGenerating((prev) => ({ ...prev, [report.id]: true }))
    setMessage('')
    try {
      await postJson(report.endpoint, report.body)
      setMessage(`${report.title} generated successfully.`)
    } catch {
      setMessage(`Failed to generate ${report.title}.`)
    } finally {
      setGenerating((prev) => ({ ...prev, [report.id]: false }))
    }
  }

  return (
    <>
      <Heading>Reports</Heading>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Generate and download compliance, usage, and security reports.
      </p>

      {message && (
        <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800">
          {message}
        </p>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => (
          <div
            key={report.id}
            className="flex flex-col rounded-2xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900"
          >
            <Subheading>{report.title}</Subheading>
            <p className="mt-2 flex-1 text-sm text-zinc-500 dark:text-zinc-400">{report.description}</p>
            <div className="mt-4">
              <Button
                disabled={generating[report.id]}
                onClick={() => handleGenerate(report)}
              >
                {generating[report.id] ? 'Generating...' : 'Generate'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
