'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'

export const sections = [
  { title: 'Tools list', id: 'tools-list' },
  { title: 'Tool policies', id: 'tool-policies' },
  { title: 'Tool executions', id: 'tool-executions' },
  { title: 'CLI console', id: 'cli-console' },
]

/* ------------------------------------------------------------------ */
/*  Fetch helpers                                                      */
/* ------------------------------------------------------------------ */

async function loadJson(path) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

async function patchJson(path, body) {
  const res = await fetch(path, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

/* ------------------------------------------------------------------ */
/*  Skeletons                                                          */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 h-8 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-2 h-3 w-32 rounded bg-zinc-100 dark:bg-zinc-800" />
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700"
          >
            <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="mt-2 h-3 w-56 rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ToolsRegistryPage() {
  // Registry state
  const [tools, setTools] = useState(null)
  const [toolsLoading, setToolsLoading] = useState(true)
  const [toolsError, setToolsError] = useState(null)
  const [expandedToolId, setExpandedToolId] = useState(null)
  const [toolDetail, setToolDetail] = useState(null)
  const [toolDetailLoading, setToolDetailLoading] = useState(false)
  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [registerInput, setRegisterInput] = useState('')
  const [toolMsg, setToolMsg] = useState(null)
  const [editingToolId, setEditingToolId] = useState(null)
  const [editInput, setEditInput] = useState('')

  // Policies state
  const [policies, setPolicies] = useState(null)
  const [policiesLoading, setPoliciesLoading] = useState(true)
  const [policiesError, setPoliciesError] = useState(null)
  const [validateInput, setValidateInput] = useState('')
  const [validateResult, setValidateResult] = useState(null)

  // Executions state
  const [executions, setExecutions] = useState(null)
  const [executionsLoading, setExecutionsLoading] = useState(true)
  const [executionsError, setExecutionsError] = useState(null)
  const [expandedExecId, setExpandedExecId] = useState(null)
  const [execDetail, setExecDetail] = useState(null)
  const [execDetailLoading, setExecDetailLoading] = useState(false)

  // CLI state
  const [cliTools, setCliTools] = useState(null)
  const [cliCatalog, setCliCatalog] = useState(null)
  const [cliLoading, setCliLoading] = useState(true)
  const [cliError, setCliError] = useState(null)
  const [selectedCliTool, setSelectedCliTool] = useState(null)
  const [cliHelp, setCliHelp] = useState(null)
  const [cliArgs, setCliArgs] = useState('')
  const [cliOutput, setCliOutput] = useState(null)
  const [cliExecuting, setCliExecuting] = useState(false)

  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setToolsLoading(true)
    setPoliciesLoading(true)
    setExecutionsLoading(true)
    setCliLoading(true)
    setError(null)
    try {
      const [t, p, e, ct, cc] = await Promise.allSettled([
        loadJson('/api/tools/registry'),
        loadJson('/api/tools/policies'),
        loadJson('/api/tools/executions'),
        loadJson('/api/openclaw/cli/tools'),
        loadJson('/api/openclaw/cli/catalog'),
      ])

      if (t.status === 'fulfilled') {
        const data = t.value
        setTools(Array.isArray(data) ? data : data.tools ?? data.items ?? [])
      } else setToolsError(t.reason?.message)

      if (p.status === 'fulfilled') {
        const data = p.value
        setPolicies(
          Array.isArray(data) ? data : data.policies ?? data.items ?? [],
        )
      } else setPoliciesError(p.reason?.message)

      if (e.status === 'fulfilled') {
        const data = e.value
        setExecutions(
          Array.isArray(data)
            ? data
            : data.executions ?? data.items ?? [],
        )
      } else setExecutionsError(e.reason?.message)

      if (ct.status === 'fulfilled') {
        const data = ct.value
        setCliTools(
          Array.isArray(data) ? data : data.tools ?? data.items ?? [],
        )
      }
      if (cc.status === 'fulfilled') setCliCatalog(cc.value)

      if ([t, p, e, ct, cc].every((r) => r.status === 'rejected')) {
        setCliError('CLI endpoints unavailable')
        throw new Error('All endpoints failed')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setToolsLoading(false)
      setPoliciesLoading(false)
      setExecutionsLoading(false)
      setCliLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* -- Registry handlers -- */
  async function handleViewTool(toolId) {
    if (expandedToolId === toolId) {
      setExpandedToolId(null)
      setToolDetail(null)
      return
    }
    setExpandedToolId(toolId)
    setToolDetailLoading(true)
    try {
      const data = await loadJson(`/api/tools/registry/${toolId}`)
      setToolDetail(data)
    } catch {
      setToolDetail(null)
    } finally {
      setToolDetailLoading(false)
    }
  }

  async function handleRegister() {
    setToolMsg(null)
    try {
      const body = registerInput.trim() ? JSON.parse(registerInput) : {}
      await postJson('/api/tools/registry', body)
      setToolMsg('Tool registered.')
      setRegisterInput('')
      setShowRegisterForm(false)
      fetchData()
    } catch (err) {
      setToolMsg(`Failed: ${err.message}`)
    }
  }

  async function handleUpdateTool(toolId) {
    setToolMsg(null)
    try {
      const body = editInput.trim() ? JSON.parse(editInput) : {}
      await patchJson(`/api/tools/registry/${toolId}`, body)
      setToolMsg(`Tool ${toolId} updated.`)
      setEditingToolId(null)
      setEditInput('')
      fetchData()
    } catch (err) {
      setToolMsg(`Update failed: ${err.message}`)
    }
  }

  /* -- Policy handlers -- */
  async function handleValidatePolicy() {
    setValidateResult(null)
    try {
      const body = validateInput.trim() ? JSON.parse(validateInput) : {}
      const result = await postJson('/api/tools/policies/validate', body)
      setValidateResult(result)
    } catch (err) {
      setValidateResult({ error: err.message })
    }
  }

  /* -- Execution handlers -- */
  async function handleViewExecution(execId) {
    if (expandedExecId === execId) {
      setExpandedExecId(null)
      setExecDetail(null)
      return
    }
    setExpandedExecId(execId)
    setExecDetailLoading(true)
    try {
      const data = await loadJson(`/api/tools/executions/${execId}`)
      setExecDetail(data)
    } catch {
      setExecDetail(null)
    } finally {
      setExecDetailLoading(false)
    }
  }

  /* -- CLI handlers -- */
  async function handleSelectCliTool(toolName) {
    setSelectedCliTool(toolName)
    setCliHelp(null)
    setCliOutput(null)
    setCliArgs('')
    try {
      const data = await loadJson(`/api/openclaw/cli/${toolName}/help`)
      setCliHelp(data)
    } catch {
      setCliHelp(null)
    }
  }

  async function handleCliExec() {
    setCliExecuting(true)
    setCliOutput(null)
    try {
      const body = cliArgs.trim() ? JSON.parse(cliArgs) : {}
      const result = await postJson(
        `/api/openclaw/cli/${selectedCliTool}/exec`,
        body,
      )
      setCliOutput(result)
    } catch (err) {
      setCliOutput({ error: err.message })
    } finally {
      setCliExecuting(false)
    }
  }

  const globalError =
    error || toolsError || policiesError || executionsError || cliError

  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Tools Registry & CLI
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Register, manage, and execute tools from the registry and CLI
            catalog.
          </p>

          {/* Error banner */}
          {globalError && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Some data could not be loaded
              </p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                The gateway may be starting up or temporarily unavailable. Try
                refreshing the page.
              </p>
            </div>
          )}

          {/* ---- Tools List ---- */}
          <section id="tools-list" className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
                Tools Registry
              </h2>
              <Button
                variant="secondary"
                onClick={() => setShowRegisterForm(!showRegisterForm)}
              >
                Register Tool
              </Button>
            </div>

            {showRegisterForm && (
              <div className="mt-3 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
                <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                  Tool Definition (JSON)
                </label>
                <textarea
                  className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                  rows={4}
                  value={registerInput}
                  onChange={(e) => setRegisterInput(e.target.value)}
                  placeholder='{"name": "...", "description": "...", "schema": {}}'
                />
                <div className="mt-3 flex gap-2">
                  <Button variant="filled" onClick={handleRegister}>
                    Register
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowRegisterForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {toolMsg && (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                {toolMsg}
              </p>
            )}

            {toolsLoading && !tools ? (
              <div className="mt-4">
                <SkeletonList />
              </div>
            ) : tools && tools.length > 0 ? (
              <div className="mt-4 overflow-auto rounded-2xl border border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-950/5 dark:border-white/5">
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Name
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Version
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Status
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-950/5 dark:divide-white/5">
                    {tools.map((tool, idx) => (
                      <tr key={tool.id ?? tool.name ?? idx}>
                        <td className="px-4 py-2 font-medium text-zinc-950 dark:text-white">
                          {tool.name ?? tool.id ?? `Tool ${idx + 1}`}
                        </td>
                        <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                          {tool.version ?? '-'}
                        </td>
                        <td className="px-4 py-2">
                          {tool.status && (
                            <Tag
                              color={
                                tool.status === 'active'
                                  ? 'orange'
                                  : 'zinc'
                              }
                              variant="small"
                            >
                              {tool.status.toUpperCase()}
                            </Tag>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <Button
                              variant="secondary"
                              onClick={() =>
                                handleViewTool(tool.id ?? tool.name)
                              }
                            >
                              View
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() =>
                                setEditingToolId(
                                  editingToolId === (tool.id ?? tool.name)
                                    ? null
                                    : tool.id ?? tool.name,
                                )
                              }
                            >
                              Edit
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Expanded tool detail */}
                {expandedToolId && (
                  <div className="border-t border-zinc-950/5 p-4 dark:border-white/5">
                    {toolDetailLoading ? (
                      <SkeletonCard />
                    ) : toolDetail ? (
                      <pre className="max-h-48 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
                        {JSON.stringify(toolDetail, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Could not load tool detail.
                      </p>
                    )}
                  </div>
                )}

                {/* Edit form */}
                {editingToolId && (
                  <div className="border-t border-zinc-950/5 p-4 dark:border-white/5">
                    <textarea
                      className="w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                      rows={3}
                      value={editInput}
                      onChange={(e) => setEditInput(e.target.value)}
                      placeholder='{"description": "updated..."}'
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="filled"
                        onClick={() => handleUpdateTool(editingToolId)}
                      >
                        Update
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setEditingToolId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No tools registered.
                </p>
              </div>
            )}
          </section>

          {/* ---- Tool Policies ---- */}
          <section id="tool-policies" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Tool Policies
            </h2>

            {policiesLoading && !policies ? (
              <div className="mt-4">
                <SkeletonList />
              </div>
            ) : policies && policies.length > 0 ? (
              <div className="mt-4 space-y-3">
                {policies.map((policy, idx) => (
                  <div
                    key={policy.id ?? idx}
                    className="rounded-xl border border-zinc-950/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-950 dark:text-white">
                        {policy.name ?? policy.id ?? `Policy ${idx + 1}`}
                      </span>
                      {policy.action && (
                        <Tag
                          color={
                            policy.action === 'allow'
                              ? 'orange'
                              : 'rose'
                          }
                          variant="small"
                        >
                          {policy.action.toUpperCase()}
                        </Tag>
                      )}
                    </div>
                    {policy.description && (
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {policy.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No tool policies found.
                </p>
              </div>
            )}

            {/* Validate policy */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                Validate Policy (JSON)
              </label>
              <textarea
                className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                rows={3}
                value={validateInput}
                onChange={(e) => setValidateInput(e.target.value)}
                placeholder='{"policy": {...}}'
              />
              <Button
                variant="secondary"
                onClick={handleValidatePolicy}
                className="mt-2"
              >
                Validate
              </Button>
              {validateResult && (
                <div className="mt-2 rounded-lg border border-zinc-950/5 bg-zinc-50 p-3 dark:border-white/5 dark:bg-zinc-800">
                  {validateResult.error ? (
                    <p className="text-sm text-rose-600 dark:text-rose-400">
                      {validateResult.error}
                    </p>
                  ) : (
                    <pre className="max-h-32 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
                      {JSON.stringify(validateResult, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ---- Tool Executions ---- */}
          <section id="tool-executions" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Execution Log
            </h2>

            {executionsLoading && !executions ? (
              <div className="mt-4">
                <SkeletonList />
              </div>
            ) : executions && executions.length > 0 ? (
              <div className="mt-4 space-y-3">
                {executions.map((exec, idx) => (
                  <div key={exec.id ?? exec.executionId ?? idx}>
                    <button
                      onClick={() =>
                        handleViewExecution(exec.id ?? exec.executionId)
                      }
                      className="w-full rounded-xl border border-zinc-950/10 bg-white px-4 py-3 text-left transition hover:bg-zinc-50 outline-2 outline-offset-2 outline-orange-500 focus-visible:outline dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-zinc-950 dark:text-white">
                          {exec.toolName ??
                            exec.tool ??
                            exec.id ??
                            `Execution ${idx + 1}`}
                        </span>
                        <div className="flex items-center gap-2">
                          {exec.status && (
                            <Tag
                              color={
                                exec.status === 'success' ||
                                exec.status === 'completed'
                                  ? 'orange'
                                  : exec.status === 'error' ||
                                      exec.status === 'failed'
                                    ? 'rose'
                                    : 'amber'
                              }
                              variant="medium"
                            >
                              {exec.status.toUpperCase()}
                            </Tag>
                          )}
                          {exec.timestamp && (
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {new Date(exec.timestamp).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    {expandedExecId === (exec.id ?? exec.executionId) && (
                      <div className="ml-4 mt-2 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                        {execDetailLoading ? (
                          <SkeletonCard />
                        ) : execDetail ? (
                          <pre className="max-h-48 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
                            {JSON.stringify(execDetail, null, 2)}
                          </pre>
                        ) : (
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            Could not load execution detail.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No tool executions found.
                </p>
              </div>
            )}
          </section>

          {/* ---- CLI Console ---- */}
          <section id="cli-console" className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              CLI Console
            </h2>

            {/* Tool selector */}
            {cliLoading && !cliTools ? (
              <div className="mt-4">
                <SkeletonCard />
              </div>
            ) : (
              <>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(cliTools ?? []).map((tool, idx) => {
                    const name =
                      typeof tool === 'string'
                        ? tool
                        : tool.name ?? tool.id ?? `tool-${idx}`
                    return (
                      <button
                        key={name}
                        onClick={() => handleSelectCliTool(name)}
                        className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                          selectedCliTool === name
                            ? 'bg-orange-500 text-white'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {name}
                      </button>
                    )
                  })}
                </div>

                {/* Catalog info */}
                {cliCatalog && !selectedCliTool && (
                  <div className="mt-3 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Catalog
                    </span>
                    <pre className="mt-2 max-h-32 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
                      {JSON.stringify(cliCatalog, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Help panel */}
                {selectedCliTool && cliHelp && (
                  <div className="mt-3 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Help: {selectedCliTool}
                    </span>
                    <pre className="mt-2 max-h-48 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
                      {typeof cliHelp === 'string'
                        ? cliHelp
                        : JSON.stringify(cliHelp, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Execute */}
                {selectedCliTool && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-zinc-950 dark:text-white">
                      Arguments (JSON)
                    </label>
                    <textarea
                      className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                      rows={3}
                      value={cliArgs}
                      onChange={(e) => setCliArgs(e.target.value)}
                      placeholder='{"arg1": "value1"}'
                    />
                    <Button
                      variant="filled"
                      onClick={handleCliExec}
                      disabled={cliExecuting}
                      className="mt-2"
                    >
                      {cliExecuting ? 'Executing...' : 'Execute'}
                    </Button>

                    {cliOutput && (
                      <div className="mt-3 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/5 dark:bg-zinc-800">
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Output
                        </span>
                        {cliOutput.error ? (
                          <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                            {cliOutput.error}
                          </p>
                        ) : (
                          <pre className="mt-2 max-h-64 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
                            {typeof cliOutput === 'string'
                              ? cliOutput
                              : JSON.stringify(cliOutput, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}
