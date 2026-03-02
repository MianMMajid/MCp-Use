'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadJson, postJson, patchJson } from '@/lib/api'
import { Button } from '@/components/Button'
import { Tag } from '@/components/Tag'
import { SkeletonCard, SkeletonList } from '@/components/Skeleton'

export default function ToolsRegistry() {
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

  const fetchData = useCallback(async () => {
    setToolsLoading(true)
    setToolsError(null)
    try {
      const data = await loadJson('/api/tools/registry')
      setTools(Array.isArray(data) ? data : data.tools ?? data.items ?? [])
    } catch (err) {
      setToolsError(err.message)
    } finally {
      setToolsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!toolMsg) return
    const t = setTimeout(() => setToolMsg(null), 5000)
    return () => clearTimeout(t)
  }, [toolMsg])

  async function handleViewTool(toolId) {
    if (expandedToolId === toolId) { setExpandedToolId(null); setToolDetail(null); return }
    setExpandedToolId(toolId)
    setToolDetailLoading(true)
    try { setToolDetail(await loadJson(`/api/tools/registry/${toolId}`)) }
    catch { setToolDetail(null) }
    finally { setToolDetailLoading(false) }
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
    } catch (err) { setToolMsg(`Failed: ${err.message}`) }
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
    } catch (err) { setToolMsg(`Update failed: ${err.message}`) }
  }

  return (
    <section id="tools-list" className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Tools Registry</h2>
        <Button variant="secondary" onClick={() => setShowRegisterForm(!showRegisterForm)}>Register Tool</Button>
      </div>

      {showRegisterForm && (
        <div className="mt-3 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-800">
          <label className="block text-sm font-medium text-zinc-950 dark:text-white">Tool Definition (JSON)</label>
          <textarea className="mt-2 w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-2 outline-offset-2 outline-orange-500 focus:outline dark:border-white/10 dark:bg-zinc-900 dark:text-white" rows={4} value={registerInput} onChange={(e) => setRegisterInput(e.target.value)} placeholder='{"name": "...", "description": "...", "schema": {}}' />
          <div className="mt-3 flex gap-2">
            <Button variant="filled" onClick={handleRegister}>Register</Button>
            <Button variant="secondary" onClick={() => setShowRegisterForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {toolMsg && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{toolMsg}</p>}

      {toolsLoading && !tools ? (
        <div className="mt-4"><SkeletonList /></div>
      ) : tools && tools.length > 0 ? (
        <div className="mt-4 overflow-auto rounded-2xl border border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900">
          <table className="min-w-[600px] w-full text-left text-sm">
            <thead>
              <tr className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-950/5 dark:border-white/5">
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Name</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Version</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-950/5 dark:divide-white/5">
              {tools.map((tool, idx) => (
                <tr key={tool.id ?? tool.name ?? idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-4 py-2 font-medium text-zinc-950 dark:text-white">{tool.name ?? tool.id ?? `Tool ${idx + 1}`}</td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{tool.version ?? '-'}</td>
                  <td className="px-4 py-2">{tool.status && <Tag color={tool.status === 'active' ? 'orange' : 'zinc'} variant="small">{tool.status.toUpperCase()}</Tag>}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <Button variant="secondary" onClick={() => handleViewTool(tool.id ?? tool.name)}>View</Button>
                      <Button variant="secondary" onClick={() => setEditingToolId(editingToolId === (tool.id ?? tool.name) ? null : tool.id ?? tool.name)}>Edit</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {expandedToolId && (
            <div className="border-t border-zinc-950/5 p-4 dark:border-white/5">
              {toolDetailLoading ? <SkeletonCard /> : toolDetail ? (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(toolDetail, null, 2)}</pre>
              ) : <p className="text-sm text-zinc-500 dark:text-zinc-400">Could not load tool detail.</p>}
            </div>
          )}
          {editingToolId && (
            <div className="border-t border-zinc-950/5 p-4 dark:border-white/5">
              <textarea className="w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 font-mono text-sm text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white" rows={3} value={editInput} onChange={(e) => setEditInput(e.target.value)} placeholder='{"description": "updated..."}' />
              <div className="mt-2 flex gap-2">
                <Button variant="filled" onClick={() => handleUpdateTool(editingToolId)}>Update</Button>
                <Button variant="secondary" onClick={() => setEditingToolId(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No tools registered.</p>
        </div>
      )}

      {toolsError && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm text-amber-800 dark:text-amber-300">Could not load tools: {toolsError}</p>
        </div>
      )}
    </section>
  )
}
