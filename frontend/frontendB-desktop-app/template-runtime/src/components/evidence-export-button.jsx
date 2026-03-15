'use client'

import { useState } from 'react'
import { Button } from '@/components/button'
import { postJson } from '@/lib/api'
import { ArrowDownTrayIcon } from '@heroicons/react/20/solid'

export function EvidenceExportButton({ traceId, runId, label = 'Export Evidence' }) {
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      await postJson('/api/traces/export', {
        traceId,
        runId,
        format: 'json',
      })
    } catch {
      // Export errors are non-critical
    } finally {
      setExporting(false)
    }
  }

  return (
    <Button outline disabled={exporting} onClick={handleExport} className="gap-1">
      <ArrowDownTrayIcon className="h-4 w-4" />
      {exporting ? 'Exporting...' : label}
    </Button>
  )
}
