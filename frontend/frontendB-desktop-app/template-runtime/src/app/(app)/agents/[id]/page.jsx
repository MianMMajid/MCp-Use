'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { loadJson, postJson, connectSSE, invalidateCache } from '@/lib/api'
import { ChatPanel } from '@/components/agent-workspace/chat-panel'
import { ExecutionTrace } from '@/components/agent-workspace/execution-trace'
import { SessionList } from '@/components/agent-workspace/session-list'
import { DelegationTree } from '@/components/agent-workspace/delegation-tree'
import { Badge } from '@/components/badge'
import { Heading } from '@/components/heading'
import { Link } from '@/components/link'
import { statusColor } from '@/lib/format'
import { ChevronLeftIcon } from '@heroicons/react/16/solid'

export default function AgentWorkspacePage() {
  const { id: agentId } = useParams()

  // Agent data — non-blocking, workspace renders regardless
  const [agent, setAgent] = useState(null)
  const [agentError, setAgentError] = useState('')

  // Sessions
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(true)

  // Current conversation state
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [events, setEvents] = useState([])
  const [runs, setRuns] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [runError, setRunError] = useState('')
  const [currentRunId, setCurrentRunId] = useState(null)
  const [lastInput, setLastInput] = useState('')

  const sseRef = useRef(null)

  // Load agent details — non-blocking
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadJson(`/api/agents/${agentId}`)
        if (!cancelled) setAgent(data)
      } catch (err) {
        if (!cancelled) setAgentError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => { cancelled = true }
  }, [agentId])

  // Load sessions list — non-blocking
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const data = await loadJson(`/api/agents/${agentId}/sessions`)
      setSessions(data.items ?? [])
    } catch {
      // Sessions may not exist yet
    } finally {
      setSessionsLoading(false)
    }
  }, [agentId])

  useEffect(() => { loadSessions() }, [loadSessions])

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => { if (sseRef.current) { sseRef.current.close(); sseRef.current = null } }
  }, [])

  // Connect SSE for a session
  const connectToSession = useCallback((sid) => {
    if (sseRef.current) sseRef.current.close()
    setStreaming(true)
    const conn = connectSSE(`/api/openclaw/agent/sessions/${sid}/stream`, {
      onEvent(data) { setEvents((prev) => [...prev, data]) },
      onError() { setStreaming(false) },
      onDone(data) {
        setStreaming(false)
        if (data?.cost) {
          setMessages((prev) => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            if (last && last.role === 'agent') copy[copy.length - 1] = { ...last, cost: data.cost }
            return copy
          })
        }
      },
    })
    sseRef.current = conn
  }, [])

  // Send message
  const handleSend = useCallback(async (text) => {
    setRunError('')
    setLastInput(text)

    setMessages((prev) => [...prev, {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }])

    try {
      const res = await postJson(`/api/agents/${agentId}/run`, {
        message: text,
        sessionId: sessionId || undefined,
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error ?? errorData.details ?? `Run failed (${res.status})`)
      }

      const result = await res.json()
      const newSessionId = result.sessionId
      const runId = result.runId

      if (!sessionId) setSessionId(newSessionId)
      setCurrentRunId(runId)

      setMessages((prev) => [...prev, {
        id: `msg_${Date.now()}_reply`,
        role: 'agent',
        content: result.reply ?? result.output ?? '',
        timestamp: new Date().toISOString(),
        cost: result.cost ?? null,
      }])

      setRuns((prev) => [...prev, {
        runId,
        type: result.type ?? 'turn',
        status: result.status ?? (result.completed === false ? 'running' : 'completed'),
        sessionId: newSessionId,
        parentRunId: result.parentRunId ?? null,
        childRunIds: result.childRunIds ?? [],
      }])

      connectToSession(newSessionId)
      invalidateCache(`/api/agents/${agentId}/sessions`)
      loadSessions()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setRunError(msg)
      setMessages((prev) => [...prev, {
        id: `msg_${Date.now()}_error`,
        role: 'agent',
        content: msg,
        timestamp: new Date().toISOString(),
        error: true,
      }])
    }
  }, [agentId, sessionId, connectToSession, loadSessions])

  const handleRetry = useCallback(() => {
    if (!lastInput) return
    setRunError('')
    setMessages((prev) => {
      const copy = [...prev]
      if (copy.length > 0 && copy[copy.length - 1].error) copy.pop()
      if (copy.length > 0 && copy[copy.length - 1].role === 'user') copy.pop()
      return copy
    })
    handleSend(lastInput)
  }, [lastInput, handleSend])

  const handleStopped = useCallback(() => {
    setStreaming(false)
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null }
  }, [])

  const handleNewSession = useCallback(() => {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null }
    setSessionId(null)
    setMessages([])
    setEvents([])
    setRuns([])
    setStreaming(false)
    setRunError('')
    setCurrentRunId(null)
  }, [])

  const handleSelectSession = useCallback(async (sid) => {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null }
    setSessionId(sid)
    setEvents([])
    setStreaming(false)
    setRunError('')
    setCurrentRunId(null)

    try {
      const sessionData = await loadJson(`/api/openclaw/agent/sessions/${sid}`)
      const sessionRuns = sessionData.runs ?? []
      setRuns(sessionRuns)

      const reconstructed = []
      const sorted = [...sessionRuns].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))

      for (const run of sorted) {
        try {
          const runDetail = await loadJson(`/api/runs/${run.runId}`)
          const runData = runDetail.run ?? runDetail
          if (runData.input?.message) reconstructed.push({ id: `hist_${run.runId}_in`, role: 'user', content: runData.input.message, timestamp: runData.createdAt })
          if (runData.output?.reply) reconstructed.push({ id: `hist_${run.runId}_out`, role: 'agent', content: runData.output.reply, timestamp: runData.updatedAt, cost: run.cost ?? null })
          if (runData.error) reconstructed.push({ id: `hist_${run.runId}_err`, role: 'agent', content: runData.error, timestamp: runData.updatedAt, error: true })
        } catch { /* skip */ }
      }
      setMessages(reconstructed)
      if (sessionData.status === 'running') connectToSession(sid)
    } catch {
      setMessages([])
    }
  }, [connectToSession])

  // Derive display values — workspace always renders
  const agentName = agent?.name ?? `Agent ${typeof agentId === 'string' ? agentId.substring(0, 8) : agentId}`
  const agentStatus = agent?.status ?? 'unknown'
  const isDisabled = agent ? agent.status !== 'active' : false

  return (
    <>
      {/* Header */}
      <div className="max-lg:hidden">
        <Link href="/agents" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
          <ChevronLeftIcon className="size-4 fill-zinc-400 dark:fill-zinc-500" />
          Agents
        </Link>
      </div>
      <div className="mt-4 flex items-center gap-3 lg:mt-8">
        <Heading>{agentName}</Heading>
        <Badge color={statusColor(agentStatus)}>{agentStatus}</Badge>
      </div>
      {agent?.description && (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{agent.description}</p>
      )}
      {agentError && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{agentError}</p>
      )}

      {/* Three-panel workspace — always visible */}
      <div className="mt-6 grid h-[calc(100svh-240px)] min-h-[500px] gap-4 lg:grid-cols-[260px_1fr_340px]">
        {/* Left — Session history */}
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          <SessionList
            sessions={sessions}
            activeSessionId={sessionId}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
            loading={sessionsLoading}
          />
        </div>

        {/* Center — Chat */}
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          <ChatPanel
            messages={messages}
            onSend={handleSend}
            streaming={streaming}
            sessionId={sessionId}
            onStopped={handleStopped}
            error={runError}
            onRetry={handleRetry}
            disabled={isDisabled}
          />
        </div>

        {/* Right — Trace + delegation */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex-1 overflow-hidden">
            <ExecutionTrace events={events} currentRunId={currentRunId} />
          </div>
          <DelegationTree runs={runs} />
        </div>
      </div>
    </>
  )
}
