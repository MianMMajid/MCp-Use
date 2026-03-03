'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/button'
import { Badge } from '@/components/badge'
import { statusColor } from '@/lib/format'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'

function withConsolePath(path) {
  const base = (process.env.NEXT_PUBLIC_PROTOCOL_CONSOLE_URL || '').trim().replace(/\/+$/, '')
  return base ? `${base}${path}` : path
}

export function CanvasToolbar({
  orchestration,
  saving,
  dirty,
  onSave,
  onUpdateName,
  onUpdateStatus,
  onPublishVersion,
  onExecuteVersion,
  runtimeBusyAction,
}) {
  const router = useRouter()
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (orchestration?.name) setNameValue(orchestration.name)
  }, [orchestration?.name])

  useEffect(() => {
    if (editingName && inputRef.current) inputRef.current.focus()
  }, [editingName])

  const commitName = () => {
    setEditingName(false)
    if (nameValue.trim() && nameValue !== orchestration?.name) {
      onUpdateName(nameValue.trim())
    }
  }

  const toggleStatus = () => {
    const next = orchestration?.status === 'draft' ? 'active' : 'draft'
    onUpdateStatus(next)
  }

  const saveIndicator = saving
    ? 'Saving...'
    : dirty
      ? 'Unsaved changes'
      : 'Saved'

  const observabilityHref = withConsolePath('/maple/observability')
  const busy = Boolean(runtimeBusyAction)

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
      {/* Back */}
      <button
        onClick={() => router.push('/orchestrate')}
        className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        title="Back to orchestrations"
      >
        <ArrowLeftIcon className="h-5 w-5" />
      </button>

      {/* Name */}
      {editingName ? (
        <input
          ref={inputRef}
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName()
            if (e.key === 'Escape') { setEditingName(false); setNameValue(orchestration?.name ?? '') }
          }}
          className="flex-1 border-none bg-transparent text-sm font-medium text-zinc-900 outline-none dark:text-white"
        />
      ) : (
        <button
          onClick={() => setEditingName(true)}
          className="truncate text-sm font-medium text-zinc-900 hover:text-zinc-600 dark:text-white dark:hover:text-zinc-300"
        >
          {orchestration?.name ?? 'Loading...'}
        </button>
      )}

      {/* Status badge */}
      {orchestration && (
        <button onClick={toggleStatus} title="Toggle status">
          <Badge color={statusColor(orchestration.status)} className="cursor-pointer text-[10px]">
            {orchestration.status}
          </Badge>
        </button>
      )}

      <div className="flex-1" />

      {/* Save indicator */}
      <span className={`text-xs ${dirty ? 'text-orange-500' : 'text-zinc-400'}`}>
        {saveIndicator}
      </span>

      {/* Save button */}
      <Button outline onClick={onSave} disabled={saving || !dirty || busy} className="h-7 text-xs">
        Save Draft
      </Button>
      <Button color="orange" onClick={onPublishVersion} disabled={saving || busy} className="h-7 text-xs">
        Publish
      </Button>
      <Button color="orange" onClick={() => onExecuteVersion?.('live')} disabled={saving || busy} className="h-7 text-xs">
        Execute Version
      </Button>
      <Button outline href={observabilityHref} target="_blank" rel="noreferrer" className="h-7 text-xs">
        Observability
      </Button>
    </div>
  )
}
