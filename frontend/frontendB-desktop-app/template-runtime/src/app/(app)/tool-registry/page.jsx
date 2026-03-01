'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '@/components/dialog'
import { Heading, Subheading } from '@/components/heading'
import { Divider } from '@/components/divider'
import { Input } from '@/components/input'
import { Textarea } from '@/components/textarea'
import { Field, Label } from '@/components/fieldset'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { loadJson, postJson, patchJson } from '@/lib/api'

function SkeletonRows() {
  return (
    <div className="mt-8 animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded bg-zinc-100 dark:bg-zinc-800" />
        ))}
      </div>
    </div>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return '--'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return dateStr }
}

function statusColor(s) {
  if (!s) return 'zinc'
  const v = s.toLowerCase()
  if (v === 'active' || v === 'enabled' || v === 'success' || v === 'completed') return 'green'
  if (v === 'error' || v === 'failed' || v === 'disabled') return 'red'
  if (v === 'running' || v === 'pending') return 'orange'
  return 'zinc'
}

export default function ToolRegistryPage() {
  const [section, setSection] = useState('tools') // 'tools' | 'policies' | 'executions'
  const [tools, setTools] = useState(null)
  const [policies, setPolicies] = useState(null)
  const [executions, setExecutions] = useState(null)
  const [execCursor, setExecCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [expandedDetail, setExpandedDetail] = useState(null)
  const [expandedExec, setExpandedExec] = useState(null)
  const [expandedExecDetail, setExpandedExecDetail] = useState(null)

  // Register Dialog
  const [showRegister, setShowRegister] = useState(false)
  const [regName, setRegName] = useState('')
  const [regDesc, setRegDesc] = useState('')
  const [regConfig, setRegConfig] = useState('')
  const [regLoading, setRegLoading] = useState(false)

  // Edit Dialog
  const [editTool, setEditTool] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editConfig, setEditConfig] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // Validate Dialog
  const [showValidate, setShowValidate] = useState(false)
  const [validatePayload, setValidatePayload] = useState('')
  const [validateResult, setValidateResult] = useState(null)
  const [validateLoading, setValidateLoading] = useState(false)

  function fetchAll() {
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const [toolsData, policiesData, execData] = await Promise.all([
          loadJson('/api/tools/registry').catch(() => null),
          loadJson('/api/tools/policies').catch(() => null),
          loadJson('/api/tools/executions').catch(() => null),
        ])
        if (cancelled) return
        setTools(Array.isArray(toolsData?.tools) ? toolsData.tools : Array.isArray(toolsData) ? toolsData : [])
        setPolicies(Array.isArray(policiesData?.policies) ? policiesData.policies : Array.isArray(policiesData) ? policiesData : [])
        const execItems = Array.isArray(execData?.executions) ? execData.executions : Array.isArray(execData?.items) ? execData.items : []
        setExecutions(execItems)
        setExecCursor(execData?.nextCursor || null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }

  useEffect(() => {
    return fetchAll()
  }, [])

  async function toggleToolExpand(toolId) {
    if (expanded === toolId) { setExpanded(null); setExpandedDetail(null); return }
    setExpanded(toolId)
    try {
      const data = await loadJson(`/api/tools/registry/${toolId}`)
      setExpandedDetail(data)
    } catch {
      setExpandedDetail(null)
    }
  }

  async function toggleExecExpand(execId) {
    if (expandedExec === execId) { setExpandedExec(null); setExpandedExecDetail(null); return }
    setExpandedExec(execId)
    try {
      const data = await loadJson(`/api/tools/executions/${execId}`)
      setExpandedExecDetail(data)
    } catch {
      setExpandedExecDetail(null)
    }
  }

  async function handleRegister() {
    setRegLoading(true)
    try {
      let config = {}
      if (regConfig.trim()) { try { config = JSON.parse(regConfig) } catch { config = { raw: regConfig } } }
      await postJson('/api/tools/registry', { name: regName, description: regDesc, ...config })
      setShowRegister(false)
      setRegName(''); setRegDesc(''); setRegConfig('')
      fetchAll()
    } catch { /* ignore */ } finally { setRegLoading(false) }
  }

  async function handleEdit() {
    if (!editTool) return
    setEditLoading(true)
    try {
      let config = {}
      if (editConfig.trim()) { try { config = JSON.parse(editConfig) } catch { config = { raw: editConfig } } }
      const toolId = editTool.toolId || editTool.id
      await patchJson(`/api/tools/registry/${toolId}`, { name: editName, description: editDesc, ...config })
      setEditTool(null)
      fetchAll()
    } catch { /* ignore */ } finally { setEditLoading(false) }
  }

  async function handleValidate() {
    setValidateLoading(true)
    setValidateResult(null)
    try {
      let body = {}
      if (validatePayload.trim()) { try { body = JSON.parse(validatePayload) } catch { body = { raw: validatePayload } } }
      const res = await postJson('/api/tools/policies/validate', body)
      const data = await res.json().catch(() => ({}))
      setValidateResult(data)
    } catch {
      setValidateResult({ error: 'Validation failed' })
    } finally {
      setValidateLoading(false)
    }
  }

  async function loadMoreExecs() {
    if (!execCursor) return
    try {
      const data = await loadJson(`/api/tools/executions?cursor=${execCursor}`)
      const items = Array.isArray(data?.executions) ? data.executions : Array.isArray(data?.items) ? data.items : []
      setExecutions((prev) => [...(prev || []), ...items])
      setExecCursor(data?.nextCursor || null)
    } catch { /* ignore */ }
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Tool Registry</Heading>
        <Button className="-my-0.5" onClick={() => fetchAll()}>Refresh</Button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Some data could not be loaded</p>
        </div>
      )}

      {/* Section Toggle */}
      <div className="mt-6 flex gap-2">
        <Button outline={section !== 'tools'} onClick={() => setSection('tools')}>Tools</Button>
        <Button outline={section !== 'policies'} onClick={() => setSection('policies')}>Policies</Button>
        <Button outline={section !== 'executions'} onClick={() => setSection('executions')}>Executions</Button>
      </div>

      {loading && <SkeletonRows />}

      {/* Tools Section */}
      {!loading && section === 'tools' && (
        <>
          <div className="mt-6 flex items-center justify-between">
            <Subheading>Registered Tools</Subheading>
            <Button onClick={() => setShowRegister(true)}>Register Tool</Button>
          </div>
          {tools && tools.length === 0 && (
            <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No tools registered</p>
            </div>
          )}
          {tools && tools.length > 0 && (
            <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
              <TableHead>
                <TableRow>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Description</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader className="text-right">Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {tools.map((tool) => {
                  const toolId = tool.toolId || tool.id || tool.name
                  return (
                    <>
                      <TableRow key={toolId} className="cursor-pointer" onClick={() => toggleToolExpand(toolId)}>
                        <TableCell className="font-medium">{tool.name || toolId}</TableCell>
                        <TableCell className="text-zinc-500">{tool.description || '--'}</TableCell>
                        <TableCell><Badge color={statusColor(tool.status)}>{tool.status || 'active'}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button plain onClick={(e) => { e.stopPropagation(); setEditTool(tool); setEditName(tool.name || ''); setEditDesc(tool.description || ''); setEditConfig('') }}>
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expanded === toolId && expandedDetail && (
                        <TableRow key={`${toolId}-detail`}>
                          <TableCell colSpan={4}>
                            <pre className="overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-800">{JSON.stringify(expandedDetail, null, 2)}</pre>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}

      {/* Policies Section */}
      {!loading && section === 'policies' && (
        <>
          <div className="mt-6 flex items-center justify-between">
            <Subheading>Tool Policies</Subheading>
            <Button onClick={() => { setShowValidate(true); setValidatePayload(''); setValidateResult(null) }}>Validate</Button>
          </div>
          {policies && policies.length === 0 && (
            <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No tool policies</p>
            </div>
          )}
          {policies && policies.length > 0 && (
            <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
              <TableHead>
                <TableRow>
                  <TableHeader>Policy</TableHeader>
                  <TableHeader>Type</TableHeader>
                  <TableHeader>Scope</TableHeader>
                  <TableHeader>Status</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {policies.map((policy, idx) => (
                  <TableRow key={policy.id || idx}>
                    <TableCell className="font-medium">{policy.name || policy.id || `Policy ${idx + 1}`}</TableCell>
                    <TableCell>{policy.type || '--'}</TableCell>
                    <TableCell>{policy.scope || '--'}</TableCell>
                    <TableCell><Badge color={statusColor(policy.status)}>{policy.status || 'active'}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}

      {/* Executions Section */}
      {!loading && section === 'executions' && (
        <>
          <Subheading className="mt-6">Tool Executions</Subheading>
          {executions && executions.length === 0 && (
            <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-8 text-center dark:border-white/10 dark:bg-zinc-900">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No executions</p>
            </div>
          )}
          {executions && executions.length > 0 && (
            <>
              <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
                <TableHead>
                  <TableRow>
                    <TableHeader>Execution ID</TableHeader>
                    <TableHeader>Tool</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Started</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {executions.map((exec) => {
                    const execId = exec.executionId || exec.id || ''
                    const shortId = typeof execId === 'string' ? execId.substring(0, 12) : String(execId)
                    return (
                      <>
                        <TableRow key={execId} className="cursor-pointer" onClick={() => toggleExecExpand(execId)}>
                          <TableCell className="font-mono text-xs">{shortId}</TableCell>
                          <TableCell>{exec.toolName || exec.tool || '--'}</TableCell>
                          <TableCell><Badge color={statusColor(exec.status)}>{exec.status || '--'}</Badge></TableCell>
                          <TableCell className="text-zinc-500">{formatDate(exec.startedAt || exec.createdAt)}</TableCell>
                        </TableRow>
                        {expandedExec === execId && expandedExecDetail && (
                          <TableRow key={`${execId}-detail`}>
                            <TableCell colSpan={4}>
                              <pre className="overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-800">{JSON.stringify(expandedExecDetail, null, 2)}</pre>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    )
                  })}
                </TableBody>
              </Table>
              {execCursor && (
                <div className="mt-4 text-center">
                  <Button outline onClick={loadMoreExecs}>Load More</Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Register Dialog */}
      <Dialog open={showRegister} onClose={() => setShowRegister(false)} size="sm">
        <DialogTitle>Register Tool</DialogTitle>
        <DialogDescription>Add a new tool to the registry.</DialogDescription>
        <DialogBody>
          <div className="space-y-4">
            <Field><Label>Name</Label><Input value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="tool-name" /></Field>
            <Field><Label>Description</Label><Input value={regDesc} onChange={(e) => setRegDesc(e.target.value)} placeholder="What does this tool do?" /></Field>
            <Field><Label>Config (JSON, optional)</Label><Textarea rows={3} value={regConfig} onChange={(e) => setRegConfig(e.target.value)} placeholder='{"key": "value"}' /></Field>
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowRegister(false)}>Cancel</Button>
          <Button disabled={regLoading || !regName} onClick={handleRegister}>{regLoading ? 'Registering...' : 'Register'}</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editTool !== null} onClose={() => setEditTool(null)} size="sm">
        <DialogTitle>Edit Tool</DialogTitle>
        <DialogDescription>Update tool configuration.</DialogDescription>
        <DialogBody>
          <div className="space-y-4">
            <Field><Label>Name</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></Field>
            <Field><Label>Description</Label><Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} /></Field>
            <Field><Label>Config (JSON, optional)</Label><Textarea rows={3} value={editConfig} onChange={(e) => setEditConfig(e.target.value)} placeholder='{"key": "value"}' /></Field>
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setEditTool(null)}>Cancel</Button>
          <Button disabled={editLoading} onClick={handleEdit}>{editLoading ? 'Saving...' : 'Save'}</Button>
        </DialogActions>
      </Dialog>

      {/* Validate Dialog */}
      <Dialog open={showValidate} onClose={() => setShowValidate(false)} size="sm">
        <DialogTitle>Validate Policy</DialogTitle>
        <DialogDescription>Validate a tool policy configuration.</DialogDescription>
        <DialogBody>
          <div className="space-y-4">
            <Field><Label>Policy Payload (JSON)</Label><Textarea rows={5} value={validatePayload} onChange={(e) => setValidatePayload(e.target.value)} placeholder='{"policy": "..."}' /></Field>
            {validateResult && (
              <div className={`rounded-lg border p-3 text-sm ${validateResult.valid || validateResult.ok ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'}`}>
                {validateResult.valid || validateResult.ok ? 'Valid' : validateResult.error || validateResult.message || 'Invalid'}
              </div>
            )}
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowValidate(false)}>Close</Button>
          <Button disabled={validateLoading} onClick={handleValidate}>{validateLoading ? 'Validating...' : 'Validate'}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
