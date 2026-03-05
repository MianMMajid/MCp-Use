'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { ChatHeader } from '@/components/chat-header'
import {
  listOrchestrationExecutions,
  listOrchestrations,
  loadExecutionTasks,
} from '@/lib/orchestrations-api'
import { statusColor } from '@/lib/format'
import { ClipboardDocumentListIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'

function shortId(value) {
  if (!value) return '--'
  const text = String(value)
  return text.length <= 14 ? text : text.slice(0, 14)
}

export default function TasksPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const orchestrations = await listOrchestrations()
        const byExecution = await Promise.all(
          orchestrations.map(async (orchestration) => {
            const orchestrationId = String(orchestration.id || '')
            if (!orchestrationId) return []
            const executions = await listOrchestrationExecutions(orchestrationId, 3).catch(() => [])
            const withTasks = await Promise.all(
              executions.map(async (execution) => {
                const executionId = String(execution.executionId || execution.id || '')
                if (!executionId) return []
                const tasks = await loadExecutionTasks(executionId).catch(() => [])
                return tasks.map((task) => ({
                  ...task,
                  orchestrationId,
                  orchestrationName: orchestration.name || orchestrationId,
                  executionId,
                  executionStatus: execution.status || 'unknown',
                }))
              }),
            )
            return withTasks.flat()
          }),
        )

        if (!cancelled) {
          setRows(byExecution.flat())
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load tasks')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    if (!search) return rows
    const q = search.toLowerCase()
    return rows.filter((row) => (
      String(row.title || row.id || '').toLowerCase().includes(q)
      || String(row.ownerRole || '').toLowerCase().includes(q)
      || String(row.ownerAgentId || '').toLowerCase().includes(q)
      || String(row.orchestrationName || '').toLowerCase().includes(q)
    ))
  }, [rows, search])

  return (
    <div className="flex h-full flex-col">
      <ChatHeader onToggleMobileSidebar={() => {
        if (typeof window === 'undefined') return
        window.dispatchEvent(new CustomEvent('mayple:toggle-mobile-sidebar'))
      }} />

      <div className="flex-1 overflow-y-auto bg-[var(--mayple-bg)] px-4 py-5">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Tasks</h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                All orchestration tasks with owner agent/role and running orchestration.
              </p>
            </div>
            <Button outline onClick={() => window.location.reload()}>
              Refresh
            </Button>
          </div>

          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <MagnifyingGlassIcon className="h-4 w-4 text-zinc-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tasks..."
              className="border-transparent bg-transparent shadow-none focus:border-transparent focus:ring-0"
            />
          </div>

          {error ? (
            <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          ) : null}

          {loading ? (
            <div className="grid gap-3">
              {[...Array(5)].map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <ClipboardDocumentListIcon className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-600" />
              <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">No tasks found.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((task) => (
                <div key={`${task.executionId}-${task.id}`} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {task.title || task.id}
                    </p>
                    <Badge color={statusColor(task.status || 'unknown')} className="text-[10px]">
                      {task.status || 'unknown'}
                    </Badge>
                    <Badge color={statusColor(task.executionStatus || 'unknown')} className="text-[10px]">
                      {task.executionStatus || 'unknown'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    owner role: {task.ownerRole || '--'} · owner agent: {task.ownerAgentId || '--'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    orchestration: {task.orchestrationName} ({shortId(task.orchestrationId)}) · execution: {shortId(task.executionId)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      outline
                      onClick={() => router.push(`/orchestrate/${encodeURIComponent(task.orchestrationId)}`)}
                    >
                      Open Builder
                    </Button>
                    <Button
                      outline
                      onClick={() => router.push(`/?mode=orchestration&orchestrationId=${encodeURIComponent(task.orchestrationId)}&executionId=${encodeURIComponent(task.executionId)}`)}
                    >
                      Open Orchestration Chat
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
