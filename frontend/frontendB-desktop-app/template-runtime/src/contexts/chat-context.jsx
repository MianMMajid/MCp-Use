'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { loadJson, postJson, connectSSE, invalidateCache } from '@/lib/api'

const ChatContext = createContext(null)

export function ChatProvider({ children }) {
  // Agent list
  const [agents, setAgents] = useState([])
  const [selectedAgentId, setSelectedAgentId] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('selectedAgentId') || null
    return null
  })
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [agentError, setAgentError] = useState('')

  // Sessions
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)

  // Conversation state
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [events, setEvents] = useState([])
  const [runs, setRuns] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [runError, setRunError] = useState('')
  const [currentRunId, setCurrentRunId] = useState(null)
  const [lastInput, setLastInput] = useState('')

  // Trace panel
  const [traceOpen, setTraceOpen] = useState(false)

  const sseRef = useRef(null)

  // Load agent list on mount
  useEffect(() => {
    let cancelled = false
    loadJson('/api/agents')
      .then((data) => { if (!cancelled) setAgents(data?.items ?? data ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Persist selected agent to localStorage
  useEffect(() => {
    if (selectedAgentId) localStorage.setItem('selectedAgentId', selectedAgentId)
    else localStorage.removeItem('selectedAgentId')
  }, [selectedAgentId])

  // Load agent details when selectedAgentId changes
  useEffect(() => {
    if (!selectedAgentId) { setSelectedAgent(null); setAgentError(''); return }
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadJson(`/api/agents/${selectedAgentId}`)
        if (!cancelled) { setSelectedAgent(data); setAgentError('') }
      } catch (err) {
        if (!cancelled) setAgentError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => { cancelled = true }
  }, [selectedAgentId])

  // Load sessions for selected agent
  const loadSessions = useCallback(async () => {
    if (!selectedAgentId) { setSessions([]); return }
    setSessionsLoading(true)
    try {
      const data = await loadJson(`/api/agents/${selectedAgentId}/sessions`)
      setSessions(data.items ?? [])
    } catch {
      // Sessions may not exist yet
    } finally {
      setSessionsLoading(false)
    }
  }, [selectedAgentId])

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

  // Select agent
  const selectAgent = useCallback((agentId) => {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null }
    setSelectedAgentId(agentId)
    setSessionId(null)
    setMessages([])
    setEvents([])
    setRuns([])
    setStreaming(false)
    setRunError('')
    setCurrentRunId(null)
  }, [])

  // Send message
  const handleSend = useCallback(async (text) => {
    if (!selectedAgentId) return
    setRunError('')
    setLastInput(text)

    setMessages((prev) => [...prev, {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }])

    try {
      const res = await postJson(`/api/agents/${selectedAgentId}/run`, {
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
      invalidateCache(`/api/agents/${selectedAgentId}/sessions`)
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
  }, [selectedAgentId, sessionId, connectToSession, loadSessions])

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
      const session = sessionData?.session ?? sessionData
      const sessionRuns = session?.runs ?? []
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
      if (session?.status === 'running') connectToSession(sid)
    } catch {
      setMessages([])
    }
  }, [connectToSession])

  const toggleTrace = useCallback(() => setTraceOpen((v) => !v), [])

  return (
    <ChatContext.Provider
      value={{
        agents,
        selectedAgentId,
        selectedAgent,
        agentError,
        selectAgent,
        sessions,
        sessionsLoading,
        loadSessions,
        sessionId,
        messages,
        events,
        runs,
        streaming,
        runError,
        currentRunId,
        lastInput,
        handleSend,
        handleRetry,
        handleStopped,
        handleNewSession,
        handleSelectSession,
        connectToSession,
        traceOpen,
        toggleTrace,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within ChatProvider')
  return ctx
}
