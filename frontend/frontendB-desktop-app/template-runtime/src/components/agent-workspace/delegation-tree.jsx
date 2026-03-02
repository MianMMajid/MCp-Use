'use client'

import { useState, useCallback } from 'react'
import { Badge } from '@/components/badge'
import { statusColor } from '@/lib/format'
import { loadJson } from '@/lib/api'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/16/solid'

function DelegationNode({ run, depth = 0 }) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState(null)
  const [loading, setLoading] = useState(false)

  const hasChildren = (run.childRunIds ?? []).length > 0

  const toggle = useCallback(async () => {
    if (!hasChildren) return
    if (expanded) {
      setExpanded(false)
      return
    }
    if (!children) {
      setLoading(true)
      try {
        const data = await loadJson(`/api/runs/${run.runId}/children`)
        setChildren(data.children ?? [])
      } catch {
        setChildren([])
      } finally {
        setLoading(false)
      }
    }
    setExpanded(true)
  }, [expanded, children, hasChildren, run.runId])

  return (
    <div>
      <button
        onClick={toggle}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          ) : (
            <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        <span className="truncate font-mono text-xs text-zinc-600 dark:text-zinc-400">
          {run.runId.substring(0, 8)}
        </span>
        <Badge color={statusColor(run.status)}>{run.status}</Badge>
        <span className="ml-auto text-xs text-zinc-400">{run.type}</span>
      </button>

      {loading && (
        <div style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }} className="py-1">
          <span className="text-xs text-zinc-400">Loading...</span>
        </div>
      )}

      {expanded && children && children.map((child) => (
        <DelegationNode key={child.runId} run={child} depth={depth + 1} />
      ))}
    </div>
  )
}

export function DelegationTree({ runs }) {
  if (!runs || runs.length === 0) return null

  const rootRuns = runs.filter((r) => !r.parentRunId)
  if (rootRuns.length === 0) return null

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-700">
      <div className="px-3 py-2">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Run Tree</span>
      </div>
      <div className="pb-2">
        {rootRuns.map((run) => (
          <DelegationNode key={run.runId} run={run} />
        ))}
      </div>
    </div>
  )
}
