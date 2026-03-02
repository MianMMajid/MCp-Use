'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Input } from '@/components/input'
import { Textarea } from '@/components/textarea'
import { Select } from '@/components/select'
import { Field, Label } from '@/components/fieldset'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, postJson, getCached } from '@/lib/api'
import { statusColor } from '@/lib/format'
import { SkeletonRows } from '@/components/skeleton'

export default function DownstreamPage() {
  const _ca = getCached('/api/downstream/apps')
  const _ct = getCached('/api/downstream/tools')
  const _hasCached = !!(_ca || _ct)
  const [apps, setApps] = useState(() => _ca ? (Array.isArray(_ca?.apps) ? _ca.apps : Array.isArray(_ca) ? _ca : []) : null)
  const [tools, setTools] = useState(_ct || null)
  const [loading, setLoading] = useState(!_hasCached)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)

  // Dispatch form
  const [dispatchApp, setDispatchApp] = useState('')
  const [dispatchTool, setDispatchTool] = useState('')
  const [dispatchArgs, setDispatchArgs] = useState('')
  const [dispatchResult, setDispatchResult] = useState(null)
  const [dispatchLoading, setDispatchLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [appsData, toolsData] = await Promise.all([
          loadJson('/api/downstream/apps').catch(() => null),
          loadJson('/api/downstream/tools').catch(() => null),
        ])
        if (cancelled) return
        setApps(Array.isArray(appsData?.apps) ? appsData.apps : Array.isArray(appsData) ? appsData : [])
        setTools(toolsData)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  function getToolsForApp(appId) {
    if (!tools) return []
    if (Array.isArray(tools)) return tools.filter((t) => t.appId === appId)
    if (tools[appId]) return Array.isArray(tools[appId]) ? tools[appId] : []
    return []
  }

  async function handleDispatch() {
    setDispatchLoading(true)
    setDispatchResult(null)
    try {
      let args = {}
      if (dispatchArgs.trim()) { try { args = JSON.parse(dispatchArgs) } catch { args = { raw: dispatchArgs } } }
      const res = await postJson('/api/downstream/dispatch', { app: dispatchApp, tool: dispatchTool, args })
      const data = await res.json().catch(() => ({}))
      setDispatchResult(data)
    } catch {
      setDispatchResult({ error: 'Dispatch failed' })
    } finally {
      setDispatchLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Downstream MCP</Heading>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
        </div>
      )}

      {loading && <SkeletonRows />}

      {/* Apps Table */}
      {!loading && apps && apps.length > 0 && (
        <>
          <Subheading className="mt-6">Connected Apps</Subheading>
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>App</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Tools</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {apps.map((app) => {
                const appId = app.appId || app.id || app.name
                const appTools = getToolsForApp(appId)
                const isExpanded = expanded === appId
                return (
                  <>
                    <TableRow key={appId} className="cursor-pointer" onClick={() => setExpanded(isExpanded ? null : appId)}>
                      <TableCell className="font-medium">{app.name || appId}</TableCell>
                      <TableCell><Badge color={statusColor(app.status)}>{app.status || 'active'}</Badge></TableCell>
                      <TableCell>{app.toolCount || appTools.length || '--'}</TableCell>
                    </TableRow>
                    {isExpanded && appTools.length > 0 && (
                      <TableRow key={`${appId}-tools`}>
                        <TableCell colSpan={3}>
                          <Table>
                            <TableHead>
                              <TableRow>
                                <TableHeader>Tool Name</TableHeader>
                                <TableHeader>Description</TableHeader>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {appTools.map((tool, i) => (
                                <TableRow key={tool.name || i}>
                                  <TableCell className="font-mono text-xs">{tool.name || '--'}</TableCell>
                                  <TableCell className="text-zinc-500">{tool.description || '--'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                )
              })}
            </TableBody>
          </Table>
        </>
      )}

      {!loading && apps && apps.length === 0 && (
        <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No downstream apps connected</p>
        </div>
      )}

      {/* Dispatch Form */}
      <Divider className="my-6" />
      <Subheading>Dispatch Tool Call</Subheading>
      <div className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <Label>App</Label>
            {apps && apps.length > 0 ? (
              <Select value={dispatchApp} onChange={(e) => setDispatchApp(e.target.value)}>
                <option value="">Select app...</option>
                {apps.map((app) => (
                  <option key={app.appId || app.id || app.name} value={app.appId || app.id || app.name}>
                    {app.name || app.appId || app.id}
                  </option>
                ))}
              </Select>
            ) : (
              <Input value={dispatchApp} onChange={(e) => setDispatchApp(e.target.value)} placeholder="App name" />
            )}
          </Field>
          <Field>
            <Label>Tool</Label>
            <Input value={dispatchTool} onChange={(e) => setDispatchTool(e.target.value)} placeholder="Tool name" />
          </Field>
        </div>
        <Field>
          <Label>Arguments (JSON)</Label>
          <Textarea rows={4} value={dispatchArgs} onChange={(e) => setDispatchArgs(e.target.value)} placeholder='{"arg1": "value"}' />
        </Field>
        <Button onClick={handleDispatch} disabled={dispatchLoading || !dispatchApp || !dispatchTool}>
          {dispatchLoading ? 'Dispatching...' : 'Dispatch'}
        </Button>
        {dispatchResult && (
          <div className="rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <pre className="overflow-auto text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(dispatchResult, null, 2)}</pre>
          </div>
        )}
      </div>
    </>
  )
}
