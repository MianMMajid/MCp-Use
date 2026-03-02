'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Divider } from '@/components/divider'
import { Heading, Subheading } from '@/components/heading'
import { Textarea } from '@/components/textarea'
import { Field, Label } from '@/components/fieldset'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, postJson, getCached } from '@/lib/api'
import { SkeletonRows } from '@/components/skeleton'

export default function CliToolsPage() {
  const _cc = getCached('/api/openclaw/cli/catalog')
  const _ct = getCached('/api/openclaw/cli/tools')
  const _hasCached = !!(_cc || _ct)
  const [catalog, setCatalog] = useState(() => _cc ? (Array.isArray(_cc?.tools) ? _cc.tools : Array.isArray(_cc?.catalog) ? _cc.catalog : Array.isArray(_cc) ? _cc : []) : null)
  const [loading, setLoading] = useState(!_hasCached)
  const [error, setError] = useState('')
  const [expandedHelp, setExpandedHelp] = useState(null)
  const [helpContent, setHelpContent] = useState(null)

  // Execute Dialog
  const [execTool, setExecTool] = useState(null)
  const [execArgs, setExecArgs] = useState('')
  const [execResult, setExecResult] = useState(null)
  const [execLoading, setExecLoading] = useState(false)

  // Generic execute dialog
  const [showGenericExec, setShowGenericExec] = useState(false)
  const [genericArgs, setGenericArgs] = useState('')
  const [genericResult, setGenericResult] = useState(null)
  const [genericLoading, setGenericLoading] = useState(false)

  // Tools list (separate from catalog)
  const [toolsList, setToolsList] = useState(() => _ct ? (Array.isArray(_ct?.tools) ? _ct.tools : Array.isArray(_ct) ? _ct : null) : null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [catalogData, toolsData] = await Promise.all([
          loadJson('/api/openclaw/cli/catalog'),
          loadJson('/api/openclaw/cli/tools').catch(() => null),
        ])
        if (cancelled) return
        setCatalog(Array.isArray(catalogData?.tools) ? catalogData.tools : Array.isArray(catalogData?.catalog) ? catalogData.catalog : Array.isArray(catalogData) ? catalogData : [])
        setToolsList(Array.isArray(toolsData?.tools) ? toolsData.tools : Array.isArray(toolsData) ? toolsData : null)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setCatalog([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function toggleHelp(toolName) {
    if (expandedHelp === toolName) { setExpandedHelp(null); setHelpContent(null); return }
    setExpandedHelp(toolName)
    try {
      const data = await loadJson(`/api/openclaw/cli/${toolName}/help`)
      setHelpContent(data?.help || data?.text || data?.usage || JSON.stringify(data, null, 2))
    } catch {
      setHelpContent('Failed to load help.')
    }
  }

  async function handleExec() {
    if (!execTool) return
    setExecLoading(true)
    setExecResult(null)
    try {
      let body = {}
      if (execArgs.trim()) { try { body = JSON.parse(execArgs) } catch { body = { args: execArgs } } }
      const toolName = execTool.name || execTool.tool
      const res = await postJson(`/api/openclaw/cli/${toolName}/exec`, body)
      const data = await res.json().catch(() => ({}))
      setExecResult(data)
    } catch {
      setExecResult({ error: 'Execution failed' })
    } finally {
      setExecLoading(false)
    }
  }

  async function handleGenericExec() {
    setGenericLoading(true)
    setGenericResult(null)
    try {
      let body = {}
      if (genericArgs.trim()) { try { body = JSON.parse(genericArgs) } catch { body = { args: genericArgs } } }
      const res = await postJson('/api/openclaw/cli/exec', body)
      const data = await res.json().catch(() => ({}))
      setGenericResult(data)
    } catch {
      setGenericResult({ error: 'Execution failed' })
    } finally {
      setGenericLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>CLI Tools</Heading>
        <Button onClick={() => { setShowGenericExec(true); setGenericArgs(''); setGenericResult(null) }}>Execute Command</Button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
        </div>
      )}

      {loading && <SkeletonRows />}

      {/* Registered Tools */}
      {!loading && toolsList && toolsList.length > 0 && (
        <>
          <Subheading className="mt-6">Registered Tools</Subheading>
          <div className="mt-4 flex flex-wrap gap-2">
            {toolsList.map((t, idx) => (
              <Badge key={typeof t === 'string' ? t : t.name || idx} color="zinc">
                {typeof t === 'string' ? t : t.name || JSON.stringify(t)}
              </Badge>
            ))}
          </div>
          <Divider className="my-6" />
        </>
      )}

      {/* Catalog Table */}
      {!loading && catalog && catalog.length > 0 && (
        <>
          <Subheading className="mt-6">Tool Catalog</Subheading>
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Tool Name</TableHeader>
                <TableHeader>Description</TableHeader>
                <TableHeader>Sample Command</TableHeader>
                <TableHeader className="text-right">Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {catalog.map((tool, idx) => {
                const toolName = tool.name || tool.tool || `tool-${idx}`
                const isHelpExpanded = expandedHelp === toolName
                return (
                  <>
                    <TableRow key={toolName}>
                      <TableCell className="font-mono text-xs font-medium">{toolName}</TableCell>
                      <TableCell className="text-zinc-500">{tool.description || '--'}</TableCell>
                      <TableCell className="font-mono text-xs">{tool.sample || tool.example || '--'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button plain onClick={() => toggleHelp(toolName)}>
                            {isHelpExpanded ? 'Hide' : 'Help'}
                          </Button>
                          <Button onClick={() => { setExecTool(tool); setExecArgs(''); setExecResult(null) }}>
                            Execute
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isHelpExpanded && helpContent && (
                      <TableRow key={`${toolName}-help`}>
                        <TableCell colSpan={4}>
                          <pre className="overflow-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {helpContent}
                          </pre>
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

      {!loading && catalog && catalog.length === 0 && (
        <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No CLI tools available</p>
        </div>
      )}

      {/* Per-tool Execute Dialog */}
      <Dialog open={execTool !== null} onClose={() => setExecTool(null)} size="sm">
        <DialogTitle>Execute: {execTool?.name || execTool?.tool || ''}</DialogTitle>
        <DialogDescription>Run this CLI tool with arguments.</DialogDescription>
        <DialogBody>
          <div className="space-y-4">
            <Field><Label>Arguments (JSON or text)</Label><Textarea rows={4} value={execArgs} onChange={(e) => setExecArgs(e.target.value)} placeholder='{"flag": "value"}' /></Field>
            {execResult && (
              <pre className="overflow-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs dark:bg-zinc-800">{JSON.stringify(execResult, null, 2)}</pre>
            )}
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setExecTool(null)}>Close</Button>
          <Button disabled={execLoading} onClick={handleExec}>{execLoading ? 'Executing...' : 'Execute'}</Button>
        </DialogActions>
      </Dialog>

      {/* Generic Execute Dialog */}
      <Dialog open={showGenericExec} onClose={() => setShowGenericExec(false)} size="sm">
        <DialogTitle>Execute CLI Command</DialogTitle>
        <DialogDescription>Run a generic CLI command.</DialogDescription>
        <DialogBody>
          <div className="space-y-4">
            <Field><Label>Command (JSON or text)</Label><Textarea rows={4} value={genericArgs} onChange={(e) => setGenericArgs(e.target.value)} placeholder='{"command": "..."}' /></Field>
            {genericResult && (
              <pre className="overflow-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs dark:bg-zinc-800">{JSON.stringify(genericResult, null, 2)}</pre>
            )}
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowGenericExec(false)}>Close</Button>
          <Button disabled={genericLoading} onClick={handleGenericExec}>{genericLoading ? 'Executing...' : 'Execute'}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
