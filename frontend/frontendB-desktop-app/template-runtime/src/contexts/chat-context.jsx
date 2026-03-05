'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { loadJson, postJson, connectSSE, invalidateCache } from '@/lib/api'
import {
  cancelOrchestrationExecution,
  decideOrchestrationApproval,
  executeOrchestration,
  getOrchestrationConversation,
  getOrchestrationExecution,
  getOrchestrationExecutionGraph,
  getOrchestrationExecutionSnapshot,
  getOrchestrationExecutionTimeline,
  listOrchestrationExecutions,
  listOrchestrations,
  loadExecutionReassignments,
  loadExecutionTasks,
  mutateOrchestrationExecution,
  pauseOrchestrationExecution,
  postOrchestrationConversation,
  postTaskReassignment,
  removeExecutionReassignment,
  replayOrchestrationFromNode,
  resumeOrchestrationExecution,
  retryOrchestrationNode,
} from '@/lib/orchestrations-api'
import {
  contextUrlsToArray,
  createDefaultObjectivePackage,
  normalizeObjectivePackage,
  validateObjectivePackage,
} from '@/lib/orchestration-types'

const ChatContext = createContext(null)

const CHAT_MODE_STORAGE_KEY = 'mayple_chat_mode'
const STACK_MODE_STORAGE_KEY = 'mayple_stack_mode'
const ORCHESTRATION_STORAGE_KEY = 'mayple_orchestration_id'
const ORCHESTRATION_PANEL_STORAGE_KEY = 'mayple_orchestration_dock_tab'
const LEGACY_ORCHESTRATION_PANEL_STORAGE_KEY = 'mayple_orchestration_panel_tab'
const ORCHESTRATION_DOCK_EXPANDED_STORAGE_KEY = 'mayple_orchestration_dock_expanded'
const VALID_CHAT_MODES = new Set(['agent', 'orchestration'])
const VALID_STACK_MODES = new Set(['frontend', 'backend'])
const VALID_ORCHESTRATION_PANELS = new Set(['controls', 'tasks', 'timeline', 'approvals', 'advanced'])

function normalizeMode(value) {
  const mode = String(value || '').toLowerCase()
  return VALID_CHAT_MODES.has(mode) ? mode : 'agent'
}

function normalizeStackMode(value) {
  const stackMode = String(value || '').toLowerCase()
  return VALID_STACK_MODES.has(stackMode) ? stackMode : 'frontend'
}

function normalizePanel(value) {
  const panel = String(value || '').toLowerCase()
  return VALID_ORCHESTRATION_PANELS.has(panel) ? panel : 'tasks'
}

function readWorkspaceQuery() {
  if (typeof window === 'undefined') return {}
  const search = new URLSearchParams(window.location.search)
  return {
    mode: search.get('mode') || '',
    stack: search.get('stack') || '',
    orchestrationId: search.get('orchestrationId') || '',
    executionId: search.get('executionId') || '',
    panel: search.get('panel') || '',
  }
}

function writeWorkspaceQuery({ mode, stack, orchestrationId, executionId, panel }) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)

  if (mode) url.searchParams.set('mode', mode)
  else url.searchParams.delete('mode')

  if (stack) url.searchParams.set('stack', stack)
  else url.searchParams.delete('stack')

  if (orchestrationId) url.searchParams.set('orchestrationId', orchestrationId)
  else url.searchParams.delete('orchestrationId')

  if (executionId) url.searchParams.set('executionId', executionId)
  else url.searchParams.delete('executionId')

  if (panel) url.searchParams.set('panel', panel)
  else url.searchParams.delete('panel')

  const nextPath = `${url.pathname}${url.search ? `?${url.searchParams.toString()}` : ''}${url.hash}`
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (nextPath !== currentPath) {
    window.history.replaceState({}, '', nextPath)
  }
}

function readLocalStorageValue(key, fallback = '') {
  if (typeof window === 'undefined') return fallback
  return window.localStorage.getItem(key) || fallback
}

function readLocalStorageBoolean(key, fallback = false) {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  if (raw === null) return fallback
  return raw === 'true'
}

export function ChatProvider({ children }) {
  const pathname = usePathname()

  // Agent list
  const [agents, setAgents] = useState([])
  const [selectedAgentId, setSelectedAgentId] = useState(null)
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

  // Unified workspace mode
  const [mode, setMode] = useState('agent')
  const [stackMode, setStackMode] = useState('frontend')
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [currentUser, setCurrentUser] = useState(null)

  // Orchestration workspace state
  const [orchestrations, setOrchestrations] = useState([])
  const [orchestrationsLoading, setOrchestrationsLoading] = useState(false)
  const [selectedOrchestrationId, setSelectedOrchestrationId] = useState('')
  const [orchestrationConversation, setOrchestrationConversation] = useState([])
  const [objectivePackage, setObjectivePackage] = useState(createDefaultObjectivePackage())
  const [objectiveErrors, setObjectiveErrors] = useState({})
  const [orchestrationExecutionHistory, setOrchestrationExecutionHistory] = useState([])
  const [orchestrationExecutionId, setOrchestrationExecutionId] = useState('')
  const [orchestrationExecution, setOrchestrationExecution] = useState(null)
  const [orchestrationRuntimeGraph, setOrchestrationRuntimeGraph] = useState(null)
  const [orchestrationTimeline, setOrchestrationTimeline] = useState([])
  const [orchestrationTasks, setOrchestrationTasks] = useState([])
  const [orchestrationReassignments, setOrchestrationReassignments] = useState([])
  const [orchestrationLoopState, setOrchestrationLoopState] = useState(null)
  const [orchestrationPanelTab, setOrchestrationPanelTabState] = useState('controls')
  const [orchestrationDockExpanded, setOrchestrationDockExpanded] = useState(true)
  const [orchestrationBusyAction, setOrchestrationBusyAction] = useState('')
  const [orchestrationRuntimeError, setOrchestrationRuntimeError] = useState('')
  const [storageHydrated, setStorageHydrated] = useState(false)

  const selectedOrchestration = useMemo(
    () => orchestrations.find((item) => String(item.id) === String(selectedOrchestrationId)) || null,
    [orchestrations, selectedOrchestrationId],
  )

  const sseRef = useRef(null)

  // Load agent list on mount
  useEffect(() => {
    let cancelled = false
    loadJson('/api/agents')
      .then((data) => { if (!cancelled) setAgents(data?.items ?? data ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadJson('/api/auth/me')
      .then((data) => {
        if (cancelled) return
        setCurrentUser(data?.user ?? data ?? null)
      })
      .catch(() => {
        if (!cancelled) setCurrentUser(null)
      })
    return () => { cancelled = true }
  }, [])

  // Persist selected agent to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    const query = readWorkspaceQuery()

    const storedAgentId = readLocalStorageValue('selectedAgentId', '')
    const storedMode = normalizeMode(readLocalStorageValue(CHAT_MODE_STORAGE_KEY, 'agent'))
    const rawStoredStack = readLocalStorageValue(STACK_MODE_STORAGE_KEY, '')
    const storedStack = rawStoredStack
      ? normalizeStackMode(rawStoredStack)
      : (storedMode === 'orchestration' ? 'backend' : 'frontend')
    const storedOrchestrationId = readLocalStorageValue(ORCHESTRATION_STORAGE_KEY, '')
    const storedPanel = normalizePanel(
      readLocalStorageValue(ORCHESTRATION_PANEL_STORAGE_KEY, '')
      || readLocalStorageValue(LEGACY_ORCHESTRATION_PANEL_STORAGE_KEY, '')
      || 'controls',
    )
    const storedDockExpanded = readLocalStorageBoolean(ORCHESTRATION_DOCK_EXPANDED_STORAGE_KEY, true)

    const queryStack = query.stack ? normalizeStackMode(query.stack) : ''
    const queryMode = query.mode ? normalizeMode(query.mode) : ''

    const effectiveStack = queryStack || storedStack
    const effectiveMode = queryMode || (queryStack ? (queryStack === 'backend' ? 'orchestration' : 'agent') : storedMode)

    if (storedAgentId) setSelectedAgentId(storedAgentId)
    setStackMode(effectiveStack)
    setMode(effectiveMode)
    if (query.orchestrationId) setSelectedOrchestrationId(query.orchestrationId)
    else if (storedOrchestrationId) setSelectedOrchestrationId(storedOrchestrationId)
    if (query.executionId) setOrchestrationExecutionId(query.executionId)
    setOrchestrationPanelTabState(query.panel ? normalizePanel(query.panel) : storedPanel)
    setOrchestrationDockExpanded(storedDockExpanded)
    setStorageHydrated(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !storageHydrated) return
    if (selectedAgentId) window.localStorage.setItem('selectedAgentId', selectedAgentId)
    else window.localStorage.removeItem('selectedAgentId')
  }, [selectedAgentId, storageHydrated])

  useEffect(() => {
    if (typeof window === 'undefined' || !storageHydrated) return
    window.localStorage.setItem(CHAT_MODE_STORAGE_KEY, mode)
  }, [mode, storageHydrated])

  useEffect(() => {
    if (typeof window === 'undefined' || !storageHydrated) return
    window.localStorage.setItem(STACK_MODE_STORAGE_KEY, stackMode)
  }, [stackMode, storageHydrated])

  useEffect(() => {
    if (typeof window === 'undefined' || !storageHydrated) return
    if (selectedOrchestrationId) window.localStorage.setItem(ORCHESTRATION_STORAGE_KEY, selectedOrchestrationId)
    else window.localStorage.removeItem(ORCHESTRATION_STORAGE_KEY)
  }, [selectedOrchestrationId, storageHydrated])

  useEffect(() => {
    if (typeof window === 'undefined' || !storageHydrated) return
    window.localStorage.setItem(ORCHESTRATION_PANEL_STORAGE_KEY, orchestrationPanelTab)
  }, [orchestrationPanelTab, storageHydrated])

  useEffect(() => {
    if (typeof window === 'undefined' || !storageHydrated) return
    window.localStorage.setItem(ORCHESTRATION_DOCK_EXPANDED_STORAGE_KEY, String(orchestrationDockExpanded))
  }, [orchestrationDockExpanded, storageHydrated])

  // Read URL query state on home route
  useEffect(() => {
    if (pathname !== '/') return

    const syncFromQuery = () => {
      const query = readWorkspaceQuery()
      if (query.mode) {
        const nextMode = normalizeMode(query.mode)
        setMode(nextMode)
        setStackMode(nextMode === 'orchestration' ? 'backend' : 'frontend')
      }
      if (query.stack) {
        const nextStack = normalizeStackMode(query.stack)
        setStackMode(nextStack)
        setMode(nextStack === 'backend' ? 'orchestration' : 'agent')
      }
      if (query.orchestrationId) setSelectedOrchestrationId(query.orchestrationId)
      if (query.executionId) setOrchestrationExecutionId(query.executionId)
      if (query.panel) setOrchestrationPanelTabState(normalizePanel(query.panel))
    }

    syncFromQuery()
    window.addEventListener('popstate', syncFromQuery)
    return () => window.removeEventListener('popstate', syncFromQuery)
  }, [pathname])

  // Keep URL query aligned on home route
  useEffect(() => {
    if (pathname !== '/') return

    const nextMode = mode
    const nextStack = stackMode
    const nextOrchestrationId = nextMode === 'orchestration' ? selectedOrchestrationId : ''
    const nextExecutionId = nextMode === 'orchestration' ? orchestrationExecutionId : ''
    const nextPanel = nextMode === 'orchestration' ? orchestrationPanelTab : ''

    writeWorkspaceQuery({
      mode: nextMode,
      stack: nextStack,
      orchestrationId: nextOrchestrationId,
      executionId: nextExecutionId,
      panel: nextPanel,
    })
  }, [pathname, mode, stackMode, selectedOrchestrationId, orchestrationExecutionId, orchestrationPanelTab])

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

  const loadOrchestrations = useCallback(async () => {
    setOrchestrationsLoading(true)
    try {
      const items = await listOrchestrations()
      setOrchestrations(items)
      return items
    } finally {
      setOrchestrationsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOrchestrations().catch(() => {})
  }, [loadOrchestrations])

  useEffect(() => {
    if (!orchestrations.length) return

    if (!selectedOrchestrationId) {
      setSelectedOrchestrationId(String(orchestrations[0].id || ''))
      return
    }

    const exists = orchestrations.some((item) => String(item.id) === String(selectedOrchestrationId))
    if (!exists) {
      setSelectedOrchestrationId(String(orchestrations[0].id || ''))
    }
  }, [orchestrations, selectedOrchestrationId])

  const withOrchestrationAction = useCallback(async (action, handler) => {
    setOrchestrationBusyAction(action)
    setOrchestrationRuntimeError('')
    try {
      return await handler()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setOrchestrationRuntimeError(message)
      throw error
    } finally {
      setOrchestrationBusyAction('')
    }
  }, [])

  const loadOrchestrationConversation = useCallback(async (orchestrationId) => {
    if (!orchestrationId) {
      setOrchestrationConversation([])
      setObjectivePackage(createDefaultObjectivePackage())
      setObjectiveErrors({})
      return
    }

    const payload = await getOrchestrationConversation(orchestrationId)
    setOrchestrationConversation(payload.items || [])

    const normalizedObjective = normalizeObjectivePackage(payload.objectivePackage || {})
    setObjectivePackage(normalizedObjective)
    setObjectiveErrors(validateObjectivePackage(normalizedObjective, { requireComplete: false }).errors)
  }, [])

  const loadOrchestrationExecutionQueues = useCallback(async (executionId) => {
    if (!executionId) {
      setOrchestrationTasks([])
      setOrchestrationReassignments([])
      return
    }

    const [tasks, reassignments] = await Promise.all([
      loadExecutionTasks(executionId).catch(() => []),
      loadExecutionReassignments(executionId).catch(() => []),
    ])

    setOrchestrationTasks(tasks)
    setOrchestrationReassignments(reassignments)
  }, [])

  const loadOrchestrationExecutionSnapshot = useCallback(async (executionId) => {
    if (!executionId) {
      setOrchestrationExecution(null)
      setOrchestrationRuntimeGraph(null)
      setOrchestrationTimeline([])
      setOrchestrationLoopState(null)
      setOrchestrationTasks([])
      setOrchestrationReassignments([])
      return null
    }

    try {
      const snapshot = await getOrchestrationExecutionSnapshot(executionId)
      setOrchestrationExecution(snapshot.execution || null)
      setOrchestrationRuntimeGraph(snapshot.graph || null)
      setOrchestrationTimeline(Array.isArray(snapshot.timeline) ? snapshot.timeline : [])
      setOrchestrationLoopState(snapshot.loopState || snapshot.execution?.loopState || null)

      if (Array.isArray(snapshot.tasks)) setOrchestrationTasks(snapshot.tasks)
      else setOrchestrationTasks([])

      if (Array.isArray(snapshot.reassignments)) setOrchestrationReassignments(snapshot.reassignments)
      else setOrchestrationReassignments([])

      if (!Array.isArray(snapshot.tasks) || !Array.isArray(snapshot.reassignments)) {
        await loadOrchestrationExecutionQueues(executionId)
      }

      return snapshot
    } catch {
      const [execution, graph, timeline] = await Promise.all([
        getOrchestrationExecution(executionId).catch(() => null),
        getOrchestrationExecutionGraph(executionId).catch(() => null),
        getOrchestrationExecutionTimeline(executionId, 200).catch(() => []),
      ])
      setOrchestrationExecution(execution)
      setOrchestrationRuntimeGraph(graph)
      setOrchestrationTimeline(Array.isArray(timeline) ? timeline : [])
      setOrchestrationLoopState(execution?.loopState || null)
      await loadOrchestrationExecutionQueues(executionId)
      return { execution, graph, timeline }
    }
  }, [loadOrchestrationExecutionQueues])

  const loadOrchestrationExecutionHistory = useCallback(async (orchestrationId) => {
    if (!orchestrationId) {
      setOrchestrationExecutionHistory([])
      setOrchestrationExecutionId('')
      return []
    }

    const items = await listOrchestrationExecutions(orchestrationId, 40)
    setOrchestrationExecutionHistory(items)

    if (!items.length) {
      setOrchestrationExecutionId('')
      return items
    }

    if (!orchestrationExecutionId) {
      const latestId = String(items[0]?.executionId || items[0]?.id || '')
      if (latestId) setOrchestrationExecutionId(latestId)
      return items
    }

    const exists = items.some((item) => String(item.executionId || item.id) === String(orchestrationExecutionId))
    if (!exists) {
      const latestId = String(items[0]?.executionId || items[0]?.id || '')
      setOrchestrationExecutionId(latestId)
    }

    return items
  }, [orchestrationExecutionId])

  useEffect(() => {
    if (!selectedOrchestrationId) return
    loadOrchestrationConversation(selectedOrchestrationId).catch(() => {})
    loadOrchestrationExecutionHistory(selectedOrchestrationId).catch(() => {})
  }, [selectedOrchestrationId, loadOrchestrationConversation, loadOrchestrationExecutionHistory])

  useEffect(() => {
    if (!orchestrationExecutionId) return
    loadOrchestrationExecutionSnapshot(orchestrationExecutionId).catch(() => {})
  }, [orchestrationExecutionId, loadOrchestrationExecutionSnapshot])

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

  const selectMode = useCallback((nextMode) => {
    const normalized = normalizeMode(nextMode)
    setMode(normalized)
    setStackMode(normalized === 'orchestration' ? 'backend' : 'frontend')

    if (normalized === 'orchestration' && !selectedOrchestrationId && orchestrations.length > 0) {
      setSelectedOrchestrationId(String(orchestrations[0]?.id || ''))
    }
  }, [orchestrations, selectedOrchestrationId])

  const selectStackMode = useCallback((nextStackMode) => {
    const normalized = normalizeStackMode(nextStackMode)
    setStackMode(normalized)
    const nextMode = normalized === 'backend' ? 'orchestration' : 'agent'
    setMode(nextMode)
    if (nextMode === 'orchestration' && !selectedOrchestrationId && orchestrations.length > 0) {
      setSelectedOrchestrationId(String(orchestrations[0]?.id || ''))
    }
  }, [orchestrations, selectedOrchestrationId])

  const selectOrchestration = useCallback((orchestrationId) => {
    const nextId = String(orchestrationId || '')
    setSelectedOrchestrationId(nextId)
    setOrchestrationExecutionId('')
    setOrchestrationExecution(null)
    setOrchestrationRuntimeGraph(null)
    setOrchestrationTimeline([])
    setOrchestrationTasks([])
    setOrchestrationReassignments([])
    setOrchestrationLoopState(null)
  }, [])

  const setOrchestrationPanelTab = useCallback((nextPanel) => {
    setOrchestrationPanelTabState(normalizePanel(nextPanel))
  }, [])

  const selectOrchestrationExecution = useCallback((executionId) => {
    setOrchestrationExecutionId(String(executionId || ''))
  }, [])

  const updateObjectiveField = useCallback((field, value) => {
    setObjectivePackage((prev) => {
      const next = normalizeObjectivePackage({ ...prev, [field]: value })
      const validation = validateObjectivePackage(next, { requireComplete: false })
      setObjectiveErrors(validation.errors)
      return next
    })
  }, [])

  const sendOrchestrationMessage = useCallback(async (text) => {
    const content = String(text || '').trim()
    if (!selectedOrchestrationId || !content) return null

    return withOrchestrationAction('conversation', async () => {
      const localMessage = {
        id: `local-${Date.now()}`,
        role: 'user',
        text: content,
        createdAt: new Date().toISOString(),
      }
      setOrchestrationConversation((prev) => [...prev, localMessage])

      const result = await postOrchestrationConversation(selectedOrchestrationId, {
        message: content,
        objectivePackage: {
          ...objectivePackage,
          contextUrls: contextUrlsToArray(objectivePackage.contextUrls),
        },
      })

      if (Array.isArray(result?.items)) {
        setOrchestrationConversation(result.items)
      } else if (result?.reply) {
        setOrchestrationConversation((prev) => ([
          ...prev,
          {
            id: `mgr-${Date.now()}`,
            role: 'manager',
            text: result.reply,
            createdAt: new Date().toISOString(),
          },
        ]))
      }

      if (result?.objectivePackage) {
        const normalized = normalizeObjectivePackage(result.objectivePackage)
        setObjectivePackage(normalized)
        setObjectiveErrors(validateObjectivePackage(normalized, { requireComplete: false }).errors)
      }

      return result
    })
  }, [selectedOrchestrationId, objectivePackage, withOrchestrationAction])

  const executeOrchestrationMode = useCallback(async (runMode = 'live') => {
    if (!selectedOrchestrationId) return null

    const requireComplete = runMode === 'live'
    const validation = validateObjectivePackage(objectivePackage, { requireComplete })
    setObjectiveErrors(validation.errors)
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0]
      setOrchestrationRuntimeError(String(firstError || 'Objective package is incomplete.'))
      return null
    }

    return withOrchestrationAction(runMode === 'dry_run' ? 'dry-run' : 'execute', async () => {
      const response = await executeOrchestration(selectedOrchestrationId, {
        mode: runMode,
        input: {
          objective: validation.value.goal || selectedOrchestration?.name || 'Execute orchestration',
        },
        objectivePackage: {
          ...validation.value,
          contextUrls: contextUrlsToArray(validation.value.contextUrls),
        },
        conversationContext: orchestrationConversation.slice(-25),
      })

      const executionId = String(response.executionId || '')
      if (executionId) {
        setOrchestrationExecutionId(executionId)
        await Promise.all([
          loadOrchestrationExecutionSnapshot(executionId),
          loadOrchestrationExecutionHistory(selectedOrchestrationId),
        ])
      }

      return response
    })
  }, [
    selectedOrchestrationId,
    objectivePackage,
    selectedOrchestration,
    orchestrationConversation,
    withOrchestrationAction,
    loadOrchestrationExecutionHistory,
    loadOrchestrationExecutionSnapshot,
  ])

  const pauseOrchestration = useCallback(async () => {
    if (!orchestrationExecutionId) return null
    return withOrchestrationAction('pause', async () => {
      const result = await pauseOrchestrationExecution(orchestrationExecutionId)
      await loadOrchestrationExecutionSnapshot(orchestrationExecutionId)
      return result
    })
  }, [orchestrationExecutionId, withOrchestrationAction, loadOrchestrationExecutionSnapshot])

  const resumeOrchestration = useCallback(async () => {
    if (!orchestrationExecutionId) return null
    return withOrchestrationAction('resume', async () => {
      const result = await resumeOrchestrationExecution(orchestrationExecutionId)
      await loadOrchestrationExecutionSnapshot(orchestrationExecutionId)
      return result
    })
  }, [orchestrationExecutionId, withOrchestrationAction, loadOrchestrationExecutionSnapshot])

  const cancelOrchestration = useCallback(async () => {
    if (!orchestrationExecutionId) return null
    return withOrchestrationAction('cancel', async () => {
      const result = await cancelOrchestrationExecution(orchestrationExecutionId)
      await loadOrchestrationExecutionSnapshot(orchestrationExecutionId)
      await loadOrchestrationExecutionHistory(selectedOrchestrationId)
      return result
    })
  }, [
    orchestrationExecutionId,
    selectedOrchestrationId,
    withOrchestrationAction,
    loadOrchestrationExecutionHistory,
    loadOrchestrationExecutionSnapshot,
  ])

  const createOrchestrationReassignment = useCallback(async (payload = {}) => {
    if (!orchestrationExecutionId) {
      throw new Error('Start an execution before scheduling a reassignment.')
    }

    const dueAtIso = payload?.dueAt ? new Date(payload.dueAt).toISOString() : ''
    if (!dueAtIso || Number.isNaN(new Date(dueAtIso).getTime())) {
      throw new Error('Due time is required.')
    }
    if (new Date(dueAtIso).getTime() <= Date.now()) {
      throw new Error('Due time must be in the future.')
    }

    const repeatIntervalMinutes = payload?.repeatIntervalMinutes ? Number(payload.repeatIntervalMinutes) : 0
    const maxRepeats = payload?.maxRepeats ? Number(payload.maxRepeats) : 1

    if (repeatIntervalMinutes && repeatIntervalMinutes <= 0) {
      throw new Error('Repeat interval must be greater than 0.')
    }
    if (repeatIntervalMinutes && (!Number.isFinite(maxRepeats) || maxRepeats < 1)) {
      throw new Error('Max repeats must be 1 or greater.')
    }

    const hasRoleTarget = Boolean(String(payload?.targetRole || '').trim())
    const hasAgentTarget = Boolean(String(payload?.targetAgentId || '').trim())
    if (hasRoleTarget === hasAgentTarget) {
      throw new Error('Provide exactly one reassignment target: role or agent.')
    }

    return withOrchestrationAction('reassign', async () => {
      const result = await postTaskReassignment(orchestrationExecutionId, payload.taskId, {
        dueAt: dueAtIso,
        repeatIntervalMinutes: repeatIntervalMinutes || undefined,
        maxRepeats: repeatIntervalMinutes ? maxRepeats : undefined,
        targetRole: hasRoleTarget ? String(payload.targetRole).trim() : undefined,
        targetAgentId: hasAgentTarget ? String(payload.targetAgentId).trim() : undefined,
        reason: String(payload.reason || '').trim() || undefined,
      })

      await loadOrchestrationExecutionQueues(orchestrationExecutionId)
      await loadOrchestrationExecutionSnapshot(orchestrationExecutionId)
      return result
    })
  }, [orchestrationExecutionId, withOrchestrationAction, loadOrchestrationExecutionQueues, loadOrchestrationExecutionSnapshot])

  const cancelOrchestrationReassignment = useCallback(async (reassignmentId) => {
    if (!orchestrationExecutionId || !reassignmentId) return null
    return withOrchestrationAction('cancel-reassignment', async () => {
      const result = await removeExecutionReassignment(orchestrationExecutionId, reassignmentId)
      await loadOrchestrationExecutionQueues(orchestrationExecutionId)
      await loadOrchestrationExecutionSnapshot(orchestrationExecutionId)
      return result
    })
  }, [orchestrationExecutionId, withOrchestrationAction, loadOrchestrationExecutionQueues, loadOrchestrationExecutionSnapshot])

  const submitOrchestrationApprovalDecision = useCallback(async (approvalId, decision, reason = '', challengeToken = '') => {
    if (!orchestrationExecutionId || !approvalId) return null
    return withOrchestrationAction('approval-decision', async () => {
      const result = await decideOrchestrationApproval(orchestrationExecutionId, approvalId, {
        decision,
        reason,
        challengeToken,
      })
      await loadOrchestrationExecutionSnapshot(orchestrationExecutionId)
      return result
    })
  }, [orchestrationExecutionId, withOrchestrationAction, loadOrchestrationExecutionSnapshot])

  const mutateCurrentExecution = useCallback(async (payload = {}) => {
    if (!orchestrationExecutionId) throw new Error('Start an execution before mutating runtime.')
    return withOrchestrationAction('mutate', async () => {
      const result = await mutateOrchestrationExecution(orchestrationExecutionId, payload)
      await loadOrchestrationExecutionSnapshot(orchestrationExecutionId)
      return result
    })
  }, [orchestrationExecutionId, withOrchestrationAction, loadOrchestrationExecutionSnapshot])

  const retryExecutionNode = useCallback(async (nodeId) => {
    if (!orchestrationExecutionId || !nodeId) return null
    return withOrchestrationAction('retry-node', async () => {
      const result = await retryOrchestrationNode(orchestrationExecutionId, nodeId)
      await loadOrchestrationExecutionSnapshot(orchestrationExecutionId)
      return result
    })
  }, [orchestrationExecutionId, withOrchestrationAction, loadOrchestrationExecutionSnapshot])

  const replayExecutionFromNode = useCallback(async (nodeId) => {
    if (!orchestrationExecutionId || !nodeId) return null
    return withOrchestrationAction('replay-node', async () => {
      const result = await replayOrchestrationFromNode(orchestrationExecutionId, nodeId)
      await loadOrchestrationExecutionSnapshot(orchestrationExecutionId)
      return result
    })
  }, [orchestrationExecutionId, withOrchestrationAction, loadOrchestrationExecutionSnapshot])

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
        } catch {
          // skip broken run items
        }
      }
      setMessages(reconstructed)
      if (session?.status === 'running') connectToSession(sid)
    } catch {
      setMessages([])
    }
  }, [connectToSession])

  const toggleRightPanel = useCallback(() => setRightPanelOpen((prev) => !prev), [])
  const toggleTrace = toggleRightPanel

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

        mode,
        selectMode,
        stackMode,
        selectStackMode,
        currentUser,
        rightPanelOpen,
        setRightPanelOpen,
        toggleRightPanel,
        traceOpen: rightPanelOpen,
        toggleTrace,

        orchestrations,
        orchestrationsLoading,
        loadOrchestrations,
        selectedOrchestrationId,
        selectedOrchestration,
        selectOrchestration,

        orchestrationConversation,
        sendOrchestrationMessage,
        loadOrchestrationConversation,

        objectivePackage,
        objectiveErrors,
        updateObjectiveField,

        orchestrationExecutionHistory,
        orchestrationExecutionId,
        selectOrchestrationExecution,
        orchestrationExecution,
        orchestrationRuntimeGraph,
        orchestrationTimeline,
        orchestrationTasks,
        orchestrationReassignments,
        orchestrationLoopState,
        loadOrchestrationExecutionHistory,
        loadOrchestrationExecutionSnapshot,

        orchestrationPanelTab,
        setOrchestrationPanelTab,
        orchestrationDockExpanded,
        setOrchestrationDockExpanded,

        orchestrationBusyAction,
        orchestrationRuntimeError,

        executeOrchestrationMode,
        pauseOrchestration,
        resumeOrchestration,
        cancelOrchestration,
        createOrchestrationReassignment,
        cancelOrchestrationReassignment,
        submitOrchestrationApprovalDecision,
        mutateCurrentExecution,
        retryExecutionNode,
        replayExecutionFromNode,
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
