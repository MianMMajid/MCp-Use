'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Connected apps', id: 'connected-apps' },
  { title: 'Dispatch', id: 'dispatch' },
]

async function loadJson(path) {
  const res = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

async function postJson(path, body) {
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

function SkeletonList() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
            <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DownstreamPage() {
  const [apps, setApps] = useState(null)
  const [tools, setTools] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)

  const [dispatchApp, setDispatchApp] = useState('')
  const [dispatchTool, setDispatchTool] = useState('')
  const [dispatchArgs, setDispatchArgs] = useState('')
  const [dispatchResult, setDispatchResult] = useState(null)
  const [dispatching, setDispatching] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [a, t] = await Promise.allSettled([
        loadJson('/api/downstream/apps'),
        loadJson('/api/downstream/tools'),
      ])
      if (a.status === 'fulfilled') setApps(Array.isArray(a.value?.apps) ? a.value.apps : Array.isArray(a.value) ? a.value : [])
      if (t.status === 'fulfilled') setTools(t.value)
      if (a.status === 'rejected' && t.status === 'rejected') throw new Error('All endpoints failed')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function getToolsForApp(appId) {
    if (!tools) return []
    if (Array.isArray(tools)) return tools.filter((t) => t.appId === appId)
    if (tools[appId]) return Array.isArray(tools[appId]) ? tools[appId] : []
    return []
  }

  async function handleDispatch() {
    setDispatching(true)
    setDispatchResult(null)
    try {
      let args = {}
      if (dispatchArgs.trim()) { try { args = JSON.parse(dispatchArgs) } catch { args = { raw: dispatchArgs } } }
      const data = await postJson('/api/downstream/dispatch', { app: dispatchApp, tool: dispatchTool, args })
      setDispatchResult(data)
    } catch (err) {
      setDispatchResult({ error: err.message })
    } finally { setDispatching(false) }
  }

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Downstream MCP</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">View connected downstream apps, their tools, and dispatch tool calls.</p>

          {error && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
            </div>
          )}

          <section id="connected-apps" className="mt-8">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Connected apps</h2>
            {loading ? <div className="mt-4"><SkeletonList /></div> : apps && apps.length > 0 ? (
              <div className="mt-4 space-y-3">
                {apps.map((app) => {
                  const appId = app.appId || app.id || app.name
                  const appTools = getToolsForApp(appId)
                  return (
                    <div key={appId} className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900">
                      <div className="flex items-center justify-between">
                        <button onClick={() => setExpanded(expanded === appId ? null : appId)} className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-950 dark:text-white">{app.name || appId}</span>
                          <Tag color={app.status === 'connected' || app.status === 'active' ? 'orange' : 'zinc'} variant="medium">{app.status || 'active'}</Tag>
                        </button>
                        <span className="text-xs text-zinc-500">{app.toolCount || appTools.length} tools</span>
                      </div>
                      {expanded === appId && appTools.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {appTools.map((tool, i) => (
                            <div key={tool.name || i} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1 dark:bg-zinc-800">
                              <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{tool.name}</span>
                              <span className="text-xs text-zinc-500">{tool.description || ''}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500">No downstream apps connected.</p>
              </div>
            )}
          </section>

          <section id="dispatch" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Dispatch</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Send a tool call to a downstream app.</p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-zinc-950 dark:text-white">App</label>
                <input className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-white px-4 py-2 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white" value={dispatchApp} onChange={(e) => setDispatchApp(e.target.value)} placeholder="App name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-950 dark:text-white">Tool</label>
                <input className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-white px-4 py-2 text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white" value={dispatchTool} onChange={(e) => setDispatchTool(e.target.value)} placeholder="Tool name" />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-950 dark:text-white">Arguments (JSON)</label>
              <textarea className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-white px-4 py-3 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white" rows={4} value={dispatchArgs} onChange={(e) => setDispatchArgs(e.target.value)} placeholder='{"arg": "value"}' />
            </div>
            <div className="mt-3">
              <Button variant="filled" onClick={handleDispatch} disabled={dispatching || !dispatchApp || !dispatchTool}>
                {dispatching ? 'Dispatching...' : 'Dispatch'}
              </Button>
            </div>
            {dispatchResult && (
              <div className="mt-4 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                <pre className="max-h-48 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(dispatchResult, null, 2)}</pre>
              </div>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
