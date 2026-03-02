'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadJson, postJson } from '@/lib/api'
import { Button } from '@/components/Button'
import { SkeletonCard } from '@/components/Skeleton'

export default function CliConsole() {
  const [cliTools, setCliTools] = useState(null)
  const [cliCatalog, setCliCatalog] = useState(null)
  const [cliLoading, setCliLoading] = useState(true)
  const [selectedCliTool, setSelectedCliTool] = useState(null)
  const [cliHelp, setCliHelp] = useState(null)
  const [cliArgs, setCliArgs] = useState('')
  const [cliOutput, setCliOutput] = useState(null)
  const [cliExecuting, setCliExecuting] = useState(false)
  const [genericCliArgs, setGenericCliArgs] = useState('')
  const [genericCliOutput, setGenericCliOutput] = useState(null)
  const [genericCliExecuting, setGenericCliExecuting] = useState(false)

  const fetchData = useCallback(async () => {
    setCliLoading(true)
    try {
      const [ct, cc] = await Promise.allSettled([
        loadJson('/api/openclaw/cli/tools'),
        loadJson('/api/openclaw/cli/catalog'),
      ])
      if (ct.status === 'fulfilled') {
        const data = ct.value
        setCliTools(Array.isArray(data) ? data : data.tools ?? data.items ?? [])
      }
      if (cc.status === 'fulfilled') setCliCatalog(cc.value)
    } catch { /* non-critical */ }
    finally { setCliLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleSelectCliTool(toolName) {
    setSelectedCliTool(toolName)
    setCliHelp(null)
    setCliOutput(null)
    setCliArgs('')
    try { setCliHelp(await loadJson(`/api/openclaw/cli/${toolName}/help`)) }
    catch { setCliHelp(null) }
  }

  async function handleCliExec() {
    setCliExecuting(true)
    setCliOutput(null)
    try {
      const body = cliArgs.trim() ? JSON.parse(cliArgs) : {}
      setCliOutput(await postJson(`/api/openclaw/cli/${selectedCliTool}/exec`, body))
    } catch (err) { setCliOutput({ error: err.message }) }
    finally { setCliExecuting(false) }
  }

  async function handleGenericCliExec() {
    setGenericCliExecuting(true)
    setGenericCliOutput(null)
    try {
      const body = genericCliArgs.trim() ? JSON.parse(genericCliArgs) : {}
      setGenericCliOutput(await postJson('/api/openclaw/cli/exec', body))
    } catch (err) { setGenericCliOutput({ error: err.message }) }
    finally { setGenericCliExecuting(false) }
  }

  return (
    <section id="cli-console" className="mt-10">
      <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">CLI Console</h2>

      <div className="mt-4 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
        <label className="block text-sm font-medium text-zinc-950 dark:text-white">Generic Command (JSON)</label>
        <textarea className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white" rows={3} value={genericCliArgs} onChange={(e) => setGenericCliArgs(e.target.value)} placeholder='{"command": "..."}' />
        <Button variant="filled" onClick={handleGenericCliExec} disabled={genericCliExecuting} className="mt-2">{genericCliExecuting ? 'Executing...' : 'Execute Command'}</Button>
        {genericCliOutput && (
          <div className="mt-3 rounded-xl border border-zinc-950/5 bg-white p-4 dark:border-white/5 dark:bg-zinc-900">
            {genericCliOutput.error ? <p className="text-sm text-rose-600 dark:text-rose-400">{genericCliOutput.error}</p> : (
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(genericCliOutput, null, 2)}</pre>
            )}
          </div>
        )}
      </div>

      {cliLoading && !cliTools ? (
        <div className="mt-4"><SkeletonCard /></div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {(cliTools ?? []).map((tool, idx) => {
              const name = typeof tool === 'string' ? tool : tool.name ?? tool.id ?? `tool-${idx}`
              return (
                <button type="button" key={name} onClick={() => handleSelectCliTool(name)} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${selectedCliTool === name ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}>{name}</button>
              )
            })}
          </div>
          {cliCatalog && !selectedCliTool && (
            <div className="mt-3 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Catalog</span>
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(cliCatalog, null, 2)}</pre>
            </div>
          )}
          {selectedCliTool && cliHelp && (
            <div className="mt-3 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Help: {selectedCliTool}</span>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-700 dark:text-zinc-300">{typeof cliHelp === 'string' ? cliHelp : JSON.stringify(cliHelp, null, 2)}</pre>
            </div>
          )}
          {selectedCliTool && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-950 dark:text-white">Arguments (JSON)</label>
              <textarea className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white" rows={3} value={cliArgs} onChange={(e) => setCliArgs(e.target.value)} placeholder='{"arg1": "value1"}' />
              <Button variant="filled" onClick={handleCliExec} disabled={cliExecuting} className="mt-2">{cliExecuting ? 'Executing...' : 'Execute'}</Button>
              {cliOutput && (
                <div className="mt-3 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Output</span>
                  {cliOutput.error ? <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{cliOutput.error}</p> : (
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-700 dark:text-zinc-300">{typeof cliOutput === 'string' ? cliOutput : JSON.stringify(cliOutput, null, 2)}</pre>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
