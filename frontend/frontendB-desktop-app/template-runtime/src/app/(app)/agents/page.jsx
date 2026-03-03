'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useChat } from '@/contexts/chat-context'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { ChatHeader } from '@/components/chat-header'
import { statusColor, riskColor, riskLabel } from '@/lib/format'
import { postJson } from '@/lib/api'
import { CpuChipIcon, PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid'

export default function AgentsPage() {
  const router = useRouter()
  const { agents, selectAgent } = useChat()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    if (!search) return agents
    const q = search.toLowerCase()
    return agents.filter((a) =>
      (a.name ?? '').toLowerCase().includes(q) ||
      (a.description ?? '').toLowerCase().includes(q) ||
      (a.agentId ?? a.id ?? '').toLowerCase().includes(q)
    )
  }, [agents, search])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await postJson('/api/agents', { name: 'New Agent' })
      if (res.ok) {
        const agent = await res.json()
        selectAgent(agent.id)
        router.push('/')
      }
    } catch {
      // ignore
    } finally {
      setCreating(false)
    }
  }

  const handleSelectAgent = (agentId) => {
    selectAgent(agentId)
    router.push('/')
  }

  return (
    <div className="flex h-full flex-col">
      <ChatHeader onToggleMobileSidebar={() => {}} />

      <div className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <div className="mx-auto max-w-5xl px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Agents</h1>
              <p className="mt-1 text-sm text-zinc-500">Browse and manage your agents</p>
            </div>
            <Button color="orange" onClick={handleCreate} disabled={creating}>
              <PlusIcon className="h-4 w-4" />
              {creating ? 'Creating...' : 'Create Agent'}
            </Button>
          </div>

          {/* Search */}
          <div className="mt-6 flex items-center gap-2">
            <MagnifyingGlassIcon className="h-4 w-4 text-zinc-400" />
            <Input
              type="text"
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {/* Grid */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((agent) => {
              const id = agent.agentId ?? agent.id
              return (
                <button
                  key={id}
                  onClick={() => handleSelectAgent(id)}
                  className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4 text-left transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-900/20">
                      <CpuChipIcon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                          {agent.name ?? id}
                        </span>
                        <Badge color={statusColor(agent.status)} className="text-[10px]">
                          {agent.status ?? 'unknown'}
                        </Badge>
                      </div>
                      {agent.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                          {agent.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Bottom row */}
                  <div className="mt-3 flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                    {agent.riskScore != null && (
                      <Badge color={riskColor(agent.riskScore)} className="text-[10px]">
                        {riskLabel(agent.riskScore)} risk
                      </Badge>
                    )}
                    {agent.model && (
                      <span className="text-[10px] text-zinc-400">{agent.model}</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {filtered.length === 0 && (
            <div className="mt-12 text-center">
              <CpuChipIcon className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-600" />
              <p className="mt-3 text-sm text-zinc-500">
                {search ? 'No agents match your search.' : 'No agents found.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
