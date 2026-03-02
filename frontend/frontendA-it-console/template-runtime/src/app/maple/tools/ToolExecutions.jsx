'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadJson } from '@/lib/api'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'
import { SkeletonCard, SkeletonList } from '@/components/Skeleton'

export default function ToolExecutions() {
  const [executions, setExecutions] = useState(null)
  const [executionsLoading, setExecutionsLoading] = useState(true)
  const [expandedExecId, setExpandedExecId] = useState(null)
  const [execDetail, setExecDetail] = useState(null)
  const [execDetailLoading, setExecDetailLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setExecutionsLoading(true)
    try {
      const data = await loadJson('/api/tools/executions')
      setExecutions(Array.isArray(data) ? data : data.executions ?? data.items ?? [])
    } catch { /* non-critical */ }
    finally { setExecutionsLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleViewExecution(execId) {
    if (expandedExecId === execId) { setExpandedExecId(null); setExecDetail(null); return }
    setExpandedExecId(execId)
    setExecDetailLoading(true)
    try { setExecDetail(await loadJson(`/api/tools/executions/${execId}`)) }
    catch { setExecDetail(null) }
    finally { setExecDetailLoading(false) }
  }

  return (
    <section id="tool-executions" className="mt-10">
      <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Execution Log</h2>

      {executionsLoading && !executions ? (
        <div className="mt-4"><SkeletonList /></div>
      ) : executions && executions.length > 0 ? (
        <div className="mt-4 space-y-3">
          {executions.map((exec, idx) => (
            <div key={exec.id ?? exec.executionId ?? idx}>
              <button type="button" onClick={() => handleViewExecution(exec.id ?? exec.executionId)} className="w-full rounded-xl border border-zinc-950/10 bg-white px-4 py-3 text-left transition hover:bg-zinc-50 outline-2 outline-offset-2 outline-orange-500 focus-visible:outline dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-zinc-800/60">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-zinc-950 dark:text-white">{exec.toolName ?? exec.tool ?? exec.id ?? `Execution ${idx + 1}`}</span>
                  <div className="flex items-center gap-2">
                    {exec.status && <Tag color={exec.status === 'success' || exec.status === 'completed' ? 'orange' : exec.status === 'error' || exec.status === 'failed' ? 'rose' : 'amber'} variant="medium">{exec.status.toUpperCase()}</Tag>}
                    {exec.timestamp && <span className="text-xs text-zinc-500 dark:text-zinc-400">{new Date(exec.timestamp).toLocaleString()}</span>}
                  </div>
                </div>
              </button>
              {expandedExecId === (exec.id ?? exec.executionId) && (
                <div className="ml-4 mt-2 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                  {execDetailLoading ? <SkeletonCard /> : execDetail ? (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(execDetail, null, 2)}</pre>
                  ) : <p className="text-sm text-zinc-500 dark:text-zinc-400">Could not load execution detail.</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No tool executions found.</p>
        </div>
      )}
    </section>
  )
}
