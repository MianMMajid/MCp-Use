'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChatHeader } from '@/components/chat-header'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { TemplateCatalogModal } from '@/components/orchestration/template-catalog-modal'
import { TemplateConfigWizard } from '@/components/orchestration/template-config-wizard'
import { statusColor, formatDateShort } from '@/lib/format'
import { loadJson, postJson, deleteJson } from '@/lib/api'
import { createFromOrchestrationTemplate, listOrchestrationTemplates } from '@/lib/orchestrations-api'
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { ShareIcon, TrashIcon } from '@heroicons/react/24/outline'

export default function OrchestratePage() {
  const router = useRouter()
  const [orchestrations, setOrchestrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [templateCatalogOpen, setTemplateCatalogOpen] = useState(false)
  const [templateWizardOpen, setTemplateWizardOpen] = useState(false)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [creatingFromTemplate, setCreatingFromTemplate] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadJson('/api/orchestrations')
      .then((data) => {
        if (!cancelled) setOrchestrations(data?.items ?? [])
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    if (!search) return orchestrations
    const q = search.toLowerCase()
    return orchestrations.filter((o) =>
      (o.name ?? '').toLowerCase().includes(q) ||
      (o.description ?? '').toLowerCase().includes(q)
    )
  }, [orchestrations, search])

  const handleArchive = async (e, id) => {
    e.stopPropagation()
    try {
      await deleteJson(`/api/orchestrations/${id}`)
      setOrchestrations((prev) => prev.filter((o) => o.id !== id))
    } catch {
      // ignore
    }
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await postJson('/api/orchestrations', { name: 'Untitled Orchestration' })
      if (res.ok) {
        const data = await res.json()
        router.push(`/orchestrate/${data.id}`)
      }
    } catch {
      // ignore
    } finally {
      setCreating(false)
    }
  }

  const openTemplateCatalog = async () => {
    setTemplateCatalogOpen(true)
    if (templates.length > 0) return
    setTemplatesLoading(true)
    try {
      const items = await listOrchestrationTemplates()
      setTemplates(items)
    } finally {
      setTemplatesLoading(false)
    }
  }

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template)
    setTemplateCatalogOpen(false)
    setTemplateWizardOpen(true)
  }

  const handleCreateFromTemplate = async (payload) => {
    if (!selectedTemplate) return
    setCreatingFromTemplate(true)
    try {
      const result = await createFromOrchestrationTemplate(selectedTemplate.id, payload)
      const createdId = result?.orchestration?.id || result?.id
      if (createdId) {
        router.push(`/orchestrate/${createdId}`)
      }
    } finally {
      setCreatingFromTemplate(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ChatHeader onToggleMobileSidebar={() => {}} />

      <div className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Orchestrations</h1>
              <p className="mt-1 text-sm text-zinc-500">Persistent control loops with manager-worker coordination</p>
            </div>
            <div className="flex gap-2">
              <Button outline onClick={openTemplateCatalog}>Create from Template</Button>
              <Button color="orange" onClick={handleCreate} disabled={creating}>
                <PlusIcon className="h-4 w-4" />
                {creating ? 'Creating...' : 'Create Orchestration'}
              </Button>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <MagnifyingGlassIcon className="h-4 w-4 text-zinc-400" />
            <Input
              type="text"
              placeholder="Search orchestrations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {loading && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-36 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
              ))}
            </div>
          )}

          {!loading && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((orch) => (
                <div
                  key={orch.id}
                  onClick={() => router.push(`/orchestrate/${orch.id}`)}
                  className="group flex cursor-pointer flex-col rounded-xl border border-zinc-200 bg-white p-4 text-left transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-900/20">
                      <ShareIcon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-zinc-900 dark:text-white">{orch.name}</span>
                        <Badge color={statusColor(orch.status)} className="text-[10px]">{orch.status}</Badge>
                      </div>
                      {orch.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{orch.description}</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => handleArchive(e, orch.id)}
                      className="shrink-0 rounded-md p-1 text-zinc-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      title="Archive orchestration"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                    <span className="text-[10px] text-zinc-400">{(orch.nodes ?? []).length} nodes</span>
                    <span className="text-[10px] text-zinc-400">{(orch.edges ?? []).length} edges</span>
                    <span className="ml-auto text-[10px] text-zinc-400">{formatDateShort(orch.updatedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="mt-12 text-center">
              <ShareIcon className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-600" />
              <p className="mt-3 text-sm text-zinc-500">
                {search ? 'No orchestrations match your search.' : 'No orchestrations yet. Create one to get started.'}
              </p>
            </div>
          )}
        </div>
      </div>

      <TemplateCatalogModal
        open={templateCatalogOpen}
        onClose={() => setTemplateCatalogOpen(false)}
        templates={templates}
        loading={templatesLoading}
        onSelect={handleTemplateSelect}
      />

      <TemplateConfigWizard
        open={templateWizardOpen}
        template={selectedTemplate}
        submitting={creatingFromTemplate}
        onClose={() => {
          setTemplateWizardOpen(false)
          setSelectedTemplate(null)
        }}
        onBack={() => {
          setTemplateWizardOpen(false)
          setTemplateCatalogOpen(true)
        }}
        onCreate={handleCreateFromTemplate}
      />
    </div>
  )
}
