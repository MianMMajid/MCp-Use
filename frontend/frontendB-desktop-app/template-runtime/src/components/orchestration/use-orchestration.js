'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useChat } from '@/contexts/chat-context'
import { loadJson, patchJson, postJson } from '@/lib/api'
import {
  getOrchestrationConversation,
  loadExecutionReassignments,
  loadExecutionTasks,
  postOrchestrationConversation,
  postTaskReassignment,
  removeExecutionReassignment,
} from '@/lib/orchestrations-api'
import {
  contextUrlsToArray,
  createDefaultObjectivePackage,
  normalizeObjectivePackage,
  validateObjectivePackage,
} from '@/lib/orchestration-types'
import { useEdgesState, useNodesState, addEdge } from '@xyflow/react'

const DEFAULT_DELEGATION_POLICY = {
  allowedTools: [],
  deniedTools: [],
  riskCeiling: 'medium',
  requiresApproval: true,
  constraints: {
    timeboxSeconds: 300,
    rowLimit: 100,
    allowedEndpoints: [],
    rateLimit: 10,
  },
  escalationChainId: null,
}

const TERMINAL_EXECUTION_STATUSES = new Set(['completed', 'failed', 'canceled'])

async function parseApiResponse(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) {
    const message = payload?.error || payload?.details || `Request failed (${response.status})`
    throw new Error(message)
  }
  return payload
}

function asItems(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  return []
}

function normalizeNumber(raw, fallback = 0) {
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

export function useOrchestration(orchestrationId) {
  const { agents } = useChat()
  const [orchestration, setOrchestration] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [runtimeBusyAction, setRuntimeBusyAction] = useState('')
  const [runtimeMessage, setRuntimeMessage] = useState('')
  const [runtimeError, setRuntimeError] = useState('')
  const [validation, setValidation] = useState(null)
  const [executionHistory, setExecutionHistory] = useState([])
  const [currentExecutionId, setCurrentExecutionId] = useState('')
  const [execution, setExecution] = useState(null)
  const [runtimeGraph, setRuntimeGraph] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [mutations, setMutations] = useState([])
  const [publishedVersion, setPublishedVersion] = useState('')
  const [loopState, setLoopState] = useState(null)
  const [conversation, setConversation] = useState([])
  const [objectivePackage, setObjectivePackage] = useState(createDefaultObjectivePackage())
  const [objectiveErrors, setObjectiveErrors] = useState({})
  const [tasks, setTasks] = useState([])
  const [reassignments, setReassignments] = useState([])

  const saveTimerRef = useRef(null)
  const orchestrationRef = useRef(null)

  const setRuntimeNotice = useCallback((message, error = false) => {
    if (error) {
      setRuntimeError(message)
      return
    }
    setRuntimeError('')
    setRuntimeMessage(message)
  }, [])

  const clearRuntimeNotice = useCallback(() => {
    setRuntimeError('')
    setRuntimeMessage('')
  }, [])

  const applyObjectivePackage = useCallback((incoming) => {
    if (!incoming) return
    const normalized = normalizeObjectivePackage(incoming)
    setObjectivePackage(normalized)
    const objectiveValidation = validateObjectivePackage(normalized)
    setObjectiveErrors(objectiveValidation.errors)
  }, [])

  const validateCurrentObjective = useCallback((requireComplete = true) => {
    const objectiveValidation = validateObjectivePackage(objectivePackage, { requireComplete })
    setObjectiveErrors(objectiveValidation.errors)
    return objectiveValidation
  }, [objectivePackage])

  const getStorableData = useCallback(() => {
    const storeNodes = nodes.map((n) => ({
      id: n.id,
      agentId: n.data?.agentId,
      label: n.data?.label || n.data?.agent?.name || n.id,
      role: n.data?.role || null,
      position: n.position,
      config: n.data?.config || {},
      maxRetries: n.data?.maxRetries ?? 1,
    }))
    const storeEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      delegationPolicy: e.data?.delegationPolicy ?? { ...DEFAULT_DELEGATION_POLICY },
    }))
    return { nodes: storeNodes, edges: storeEdges }
  }, [nodes, edges])

  const applyOrchestrationToCanvas = useCallback((data) => {
    const rfNodes = (data.nodes ?? []).map((n) => {
      const agent = agents.find((a) => (a.agentId ?? a.id) === n.agentId)
      return {
        id: n.id,
        type: 'agentNode',
        position: n.position ?? { x: 0, y: 0 },
        data: { ...n, agent },
      }
    })
    setNodes(rfNodes)

    const rfEdges = (data.edges ?? []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'delegationEdge',
      data: { delegationPolicy: e.delegationPolicy ?? { ...DEFAULT_DELEGATION_POLICY } },
    }))
    setEdges(rfEdges)
  }, [agents, setNodes, setEdges])

  const saveNow = useCallback(async () => {
    if (!orchestrationId) return
    setSaving(true)
    try {
      const { nodes: storeNodes, edges: storeEdges } = getStorableData()
      const updates = {
        nodes: storeNodes,
        edges: storeEdges,
      }
      if (orchestrationRef.current) {
        updates.name = orchestrationRef.current.name
        updates.status = orchestrationRef.current.status
      }
      const res = await patchJson(`/api/orchestrations/${orchestrationId}`, updates)
      const data = await parseApiResponse(res)
      setOrchestration(data)
      orchestrationRef.current = data
      setDirty(false)
      return data
    } finally {
      setSaving(false)
    }
  }, [orchestrationId, getStorableData])

  const scheduleSave = useCallback(() => {
    setDirty(true)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveNow().catch(() => {})
    }, 1500)
  }, [saveNow])

  const loadExecutionQueues = useCallback(async (executionId) => {
    if (!executionId) return
    const [nextTasks, nextReassignments] = await Promise.all([
      loadExecutionTasks(executionId).catch(() => []),
      loadExecutionReassignments(executionId).catch(() => []),
    ])
    setTasks(nextTasks)
    setReassignments(nextReassignments)
  }, [])

  const loadExecutionSnapshot = useCallback(async (executionId) => {
    if (!executionId) return null
    const data = await loadJson(`/api/orchestrations/executions/${executionId}/snapshot`)
    if (!data?.ok) return null
    setExecution(data.execution ?? null)
    setRuntimeGraph(data.graph ?? null)
    setTimeline(Array.isArray(data.timeline) ? data.timeline : [])
    setMutations(Array.isArray(data.mutations) ? data.mutations : [])
    setLoopState(data.loopState || data.execution?.loopState || null)

    const hasTasks = Array.isArray(data.tasks)
    const hasReassignments = Array.isArray(data.reassignments)
    if (hasTasks) setTasks(data.tasks)
    if (hasReassignments) setReassignments(data.reassignments)
    if (!hasTasks || !hasReassignments) await loadExecutionQueues(executionId)
    return data
  }, [loadExecutionQueues])

  const loadExecutionHistory = useCallback(async () => {
    if (!orchestrationId) return
    const history = await loadJson(`/api/orchestrations/executions?orchestrationId=${orchestrationId}&limit=20`).catch(() => null)
    const items = asItems(history)
    setExecutionHistory(items)
    if (!currentExecutionId && items.length > 0) {
      const latestId = items[0].executionId || items[0].id || ''
      if (latestId) {
        setCurrentExecutionId(latestId)
        await loadExecutionSnapshot(latestId).catch(() => {})
      }
    }
  }, [orchestrationId, currentExecutionId, loadExecutionSnapshot])

  const loadConversation = useCallback(async () => {
    if (!orchestrationId) return
    const data = await getOrchestrationConversation(orchestrationId).catch(() => null)
    if (!data) return
    if (Array.isArray(data.items)) setConversation(data.items)
    if (data.objectivePackage) applyObjectivePackage(data.objectivePackage)
  }, [orchestrationId, applyObjectivePackage])

  const callRuntimeAction = useCallback(async (action, handler) => {
    setRuntimeBusyAction(action)
    clearRuntimeNotice()
    try {
      const result = await handler()
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setRuntimeNotice(message, true)
      throw error
    } finally {
      setRuntimeBusyAction('')
    }
  }, [clearRuntimeNotice, setRuntimeNotice])

  const validateDefinition = useCallback(async (strict = false) => {
    if (!orchestrationId) return null
    return callRuntimeAction('validate', async () => {
      const res = await postJson(`/api/orchestrations/${orchestrationId}/validate`, {
        strict,
        definitionVersion: publishedVersion || undefined,
      })
      const data = await parseApiResponse(res)
      setValidation(data)
      setRuntimeNotice(data.ok ? 'Validation passed.' : 'Validation failed.', !data.ok)
      return data
    })
  }, [orchestrationId, publishedVersion, callRuntimeAction, setRuntimeNotice])

  const publishVersion = useCallback(async () => {
    if (!orchestrationId) return null
    return callRuntimeAction('publish', async () => {
      await saveNow()
      const res = await postJson(`/api/orchestrations/${orchestrationId}/publish`, {})
      const data = await parseApiResponse(res)
      const version = data?.publishedVersion || data?.versionRecord?.version || ''
      if (version) setPublishedVersion(version)
      setRuntimeNotice(version ? `Published ${version}.` : 'Published version.')
      return data
    })
  }, [orchestrationId, saveNow, callRuntimeAction, setRuntimeNotice])

  const executeVersion = useCallback(async (mode = 'live') => {
    if (!orchestrationId) return null

    if (mode === 'live') {
      const objectiveValidation = validateCurrentObjective(true)
      if (!objectiveValidation.valid) {
        setRuntimeNotice('Complete objective package is required before live execution.', true)
        return null
      }
    }

    const objectiveValidation = validateCurrentObjective(false)
    const objectiveValue = objectiveValidation.value

    return callRuntimeAction(mode === 'dry_run' ? 'dry-run' : 'execute', async () => {
      await saveNow()
      const res = await postJson(`/api/orchestrations/${orchestrationId}/execute`, {
        mode,
        input: {
          objective: objectiveValue.goal || orchestrationRef.current?.description || orchestrationRef.current?.name || 'Execute orchestration',
        },
        objectivePackage: {
          ...objectiveValue,
          contextUrls: contextUrlsToArray(objectiveValue.contextUrls),
        },
        conversationContext: conversation.slice(-25),
        definitionVersion: publishedVersion || undefined,
      })
      const data = await parseApiResponse(res)
      const nextExecutionId = data.executionId || ''
      setCurrentExecutionId(nextExecutionId)
      await loadExecutionSnapshot(nextExecutionId).catch(() => {})
      await loadExecutionHistory().catch(() => {})
      setRuntimeNotice(`Execution started (${mode === 'dry_run' ? 'dry run' : 'live'}).`)
      return data
    })
  }, [orchestrationId, publishedVersion, saveNow, loadExecutionHistory, loadExecutionSnapshot, callRuntimeAction, setRuntimeNotice, validateCurrentObjective, conversation])

  const sendConversationMessage = useCallback(async (text) => {
    if (!orchestrationId || !text.trim()) return null
    return callRuntimeAction('conversation', async () => {
      const clientMessage = {
        id: `local-${crypto.randomUUID()}`,
        role: 'user',
        text: text.trim(),
        createdAt: new Date().toISOString(),
      }
      setConversation((prev) => [...prev, clientMessage])

      const data = await postOrchestrationConversation(orchestrationId, {
        message: text.trim(),
        objectivePackage,
      })

      if (Array.isArray(data?.items)) {
        setConversation(data.items)
      } else if (data?.reply) {
        setConversation((prev) => ([
          ...prev,
          {
            id: `mgr-${crypto.randomUUID()}`,
            role: 'manager',
            text: data.reply,
            createdAt: new Date().toISOString(),
          },
        ]))
      }

      if (data?.objectivePackage) applyObjectivePackage(data.objectivePackage)
      setRuntimeNotice('Objective conversation updated.')
      return data
    })
  }, [orchestrationId, objectivePackage, callRuntimeAction, setRuntimeNotice, applyObjectivePackage])

  const pauseExecution = useCallback(async () => {
    if (!currentExecutionId) return null
    return callRuntimeAction('pause', async () => {
      const res = await postJson(`/api/orchestrations/executions/${currentExecutionId}/pause`, {})
      const data = await parseApiResponse(res)
      setExecution(data.execution ?? execution)
      await loadExecutionSnapshot(currentExecutionId).catch(() => {})
      setRuntimeNotice('Execution paused.')
      return data
    })
  }, [currentExecutionId, execution, loadExecutionSnapshot, callRuntimeAction, setRuntimeNotice])

  const resumeExecution = useCallback(async () => {
    if (!currentExecutionId) return null
    return callRuntimeAction('resume', async () => {
      const res = await postJson(`/api/orchestrations/executions/${currentExecutionId}/resume`, {})
      const data = await parseApiResponse(res)
      setExecution(data.execution ?? execution)
      await loadExecutionSnapshot(currentExecutionId).catch(() => {})
      setRuntimeNotice('Execution resumed.')
      return data
    })
  }, [currentExecutionId, execution, loadExecutionSnapshot, callRuntimeAction, setRuntimeNotice])

  const cancelExecution = useCallback(async () => {
    if (!currentExecutionId) return null
    return callRuntimeAction('cancel', async () => {
      const res = await postJson(`/api/orchestrations/executions/${currentExecutionId}/cancel`, {})
      const data = await parseApiResponse(res)
      setExecution(data.execution ?? execution)
      await loadExecutionSnapshot(currentExecutionId).catch(() => {})
      setRuntimeNotice('Execution canceled.')
      return data
    })
  }, [currentExecutionId, execution, loadExecutionSnapshot, callRuntimeAction, setRuntimeNotice])

  const mutateExecution = useCallback(async (payload) => {
    if (!currentExecutionId) throw new Error('Start an execution before applying runtime mutations.')
    return callRuntimeAction('mutate', async () => {
      const res = await postJson(`/api/orchestrations/executions/${currentExecutionId}/mutate`, payload)
      const data = await parseApiResponse(res)
      await loadExecutionSnapshot(currentExecutionId).catch(() => {})
      setRuntimeNotice(`Mutation applied: ${payload.op || payload.type || 'mutation'}.`)
      return data
    })
  }, [currentExecutionId, loadExecutionSnapshot, callRuntimeAction, setRuntimeNotice])

  const retryFailedNode = useCallback(async (nodeId) => {
    if (!currentExecutionId || !nodeId) return null
    return callRuntimeAction('retry-node', async () => {
      const res = await postJson(`/api/orchestrations/executions/${currentExecutionId}/retry-node`, { nodeId })
      const data = await parseApiResponse(res)
      await loadExecutionSnapshot(currentExecutionId).catch(() => {})
      setRuntimeNotice(`Retry requested for node ${nodeId}.`)
      return data
    })
  }, [currentExecutionId, loadExecutionSnapshot, callRuntimeAction, setRuntimeNotice])

  const replayFromNode = useCallback(async (nodeId) => {
    if (!currentExecutionId || !nodeId) return null
    return callRuntimeAction('replay-node', async () => {
      const res = await postJson(`/api/orchestrations/executions/${currentExecutionId}/replay-from-node`, { nodeId })
      const data = await parseApiResponse(res)
      await loadExecutionSnapshot(currentExecutionId).catch(() => {})
      setRuntimeNotice(`Replay requested from node ${nodeId}.`)
      return data
    })
  }, [currentExecutionId, loadExecutionSnapshot, callRuntimeAction, setRuntimeNotice])

  const submitApprovalDecision = useCallback(async (approvalId, action, reason = '', challengeToken = '') => {
    if (!currentExecutionId || !approvalId) return null
    return callRuntimeAction(action === 'reject' ? 'reject' : 'approve', async () => {
      const res = await postJson(`/api/orchestrations/executions/${currentExecutionId}/approvals/${approvalId}/decision`, {
        action,
        reason,
        challengeToken: challengeToken || undefined,
      })
      const data = await parseApiResponse(res)
      await loadExecutionSnapshot(currentExecutionId).catch(() => {})
      setRuntimeNotice(`Approval ${action}d.`)
      return data
    })
  }, [currentExecutionId, loadExecutionSnapshot, callRuntimeAction, setRuntimeNotice])

  const createTimedReassignment = useCallback(async (payload) => {
    if (!currentExecutionId) throw new Error('Start an execution before scheduling reassignment.')
    if (!payload?.taskId) throw new Error('Task is required.')

    const dueAtValue = new Date(payload.dueAt)
    if (Number.isNaN(dueAtValue.getTime()) || dueAtValue.getTime() <= Date.now()) {
      throw new Error('Due time must be in the future.')
    }

    const repeatProvided = payload.repeatIntervalMinutes != null && payload.repeatIntervalMinutes !== ''
    const repeatIntervalMinutes = repeatProvided ? normalizeNumber(payload.repeatIntervalMinutes, 0) : 0
    const maxRepeats = normalizeNumber(payload.maxRepeats, 1)
    if (repeatProvided && repeatIntervalMinutes <= 0) {
      throw new Error('Repeat interval must be positive.')
    }
    if (repeatProvided && maxRepeats < 1) {
      throw new Error('Repeat schedule requires max repeats of at least 1.')
    }

    const targetRole = String(payload.targetRole || '').trim()
    const targetAgentId = String(payload.targetAgentId || '').trim()
    const hasRole = Boolean(targetRole)
    const hasAgent = Boolean(targetAgentId)

    if ((hasRole && hasAgent) || (!hasRole && !hasAgent)) {
      throw new Error('Choose exactly one reassignment target: role or agent.')
    }

    let roleWarning = ''
    if (hasRole) {
      const roleKey = targetRole.toLowerCase()
      const runtimeNodes = Array.isArray(runtimeGraph?.nodes) ? runtimeGraph.nodes : []
      const mapped = runtimeNodes.some((node) => String(node.role || node.label || '').toLowerCase().includes(roleKey))
      if (!mapped) {
        roleWarning = `Role "${targetRole}" has no mapped agent in the current graph.`
      }
    }

    return callRuntimeAction('task-reassign', async () => {
      const data = await postTaskReassignment(currentExecutionId, payload.taskId, {
        dueAt: dueAtValue.toISOString(),
        repeatIntervalMinutes: repeatIntervalMinutes > 0 ? repeatIntervalMinutes : undefined,
        maxRepeats,
        targetRole: hasRole ? targetRole : undefined,
        targetAgentId: hasAgent ? targetAgentId : undefined,
        reason: String(payload.reason || '').trim() || undefined,
      })

      await loadExecutionQueues(currentExecutionId)
      if (roleWarning) {
        setRuntimeNotice(`${data?.message || 'Reassignment scheduled.'} ${roleWarning}`)
      } else {
        setRuntimeNotice('Reassignment scheduled.')
      }
      return data
    })
  }, [currentExecutionId, runtimeGraph, callRuntimeAction, loadExecutionQueues, setRuntimeNotice])

  const cancelTimedReassignment = useCallback(async (reassignmentId) => {
    if (!currentExecutionId || !reassignmentId) return null
    return callRuntimeAction('task-reassign-cancel', async () => {
      await removeExecutionReassignment(currentExecutionId, reassignmentId)
      await loadExecutionQueues(currentExecutionId)
      setRuntimeNotice('Reassignment canceled.')
      return { ok: true }
    })
  }, [currentExecutionId, callRuntimeAction, loadExecutionQueues, setRuntimeNotice])

  const exportExecutionSnapshot = useCallback(async () => {
    if (!currentExecutionId) return null
    return callRuntimeAction('snapshot-export', async () => {
      const snapshot = await loadExecutionSnapshot(currentExecutionId)
      const payload = snapshot ?? {
        execution,
        graph: runtimeGraph,
        timeline,
        mutations,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `orchestration-execution-${currentExecutionId}.json`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
      setRuntimeNotice('Execution snapshot exported.')
      return payload
    })
  }, [currentExecutionId, execution, runtimeGraph, timeline, mutations, loadExecutionSnapshot, callRuntimeAction, setRuntimeNotice])

  useEffect(() => {
    if (!orchestrationId) return
    let cancelled = false
    setLoading(true)
    loadJson(`/api/orchestrations/${orchestrationId}`)
      .then((data) => {
        if (cancelled) return
        setOrchestration(data)
        orchestrationRef.current = data
        applyOrchestrationToCanvas(data)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    loadConversation().catch(() => {})

    return () => { cancelled = true }
  }, [orchestrationId, applyOrchestrationToCanvas, loadConversation])

  useEffect(() => {
    if (!orchestrationId) return
    loadExecutionHistory().catch(() => {})
  }, [orchestrationId, loadExecutionHistory])

  useEffect(() => {
    if (!currentExecutionId) {
      setTasks([])
      setReassignments([])
      return
    }
    loadExecutionQueues(currentExecutionId).catch(() => {})
  }, [currentExecutionId, loadExecutionQueues])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!currentExecutionId) return
    if (!execution || TERMINAL_EXECUTION_STATUSES.has(execution.status)) return
    const interval = setInterval(() => {
      loadExecutionSnapshot(currentExecutionId).catch(() => {})
      loadExecutionQueues(currentExecutionId).catch(() => {})
    }, 1500)
    return () => clearInterval(interval)
  }, [currentExecutionId, execution, loadExecutionSnapshot, loadExecutionQueues])

  useEffect(() => {
    if (!runtimeMessage && !runtimeError) return
    const timeout = setTimeout(() => {
      setRuntimeMessage('')
      setRuntimeError('')
    }, 5000)
    return () => clearTimeout(timeout)
  }, [runtimeMessage, runtimeError])

  const addAgentNode = useCallback((agentId, position) => {
    const agent = agents.find((a) => (a.agentId ?? a.id) === agentId)
    const nodeId = `node-${crypto.randomUUID()}`
    const newNode = {
      id: nodeId,
      type: 'agentNode',
      position,
      data: { id: nodeId, agentId, agent },
    }
    setNodes((prev) => [...prev, newNode])
    scheduleSave()
    return nodeId
  }, [agents, setNodes, scheduleSave])

  const removeNode = useCallback((nodeId) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId))
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId))
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
    scheduleSave()
  }, [setNodes, setEdges, selectedNodeId, scheduleSave])

  const onConnect = useCallback((connection) => {
    const edgeId = `edge-${crypto.randomUUID()}`
    const newEdge = {
      ...connection,
      id: edgeId,
      type: 'delegationEdge',
      data: { delegationPolicy: { ...DEFAULT_DELEGATION_POLICY } },
    }
    setEdges((prev) => addEdge(newEdge, prev))
    scheduleSave()
  }, [setEdges, scheduleSave])

  const removeEdge = useCallback((edgeId) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId))
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null)
    scheduleSave()
  }, [setEdges, selectedEdgeId, scheduleSave])

  const updateEdgePolicy = useCallback((edgeId, policy) => {
    setEdges((prev) =>
      prev.map((e) =>
        e.id === edgeId
          ? { ...e, data: { ...e.data, delegationPolicy: policy } }
          : e,
      ),
    )
    scheduleSave()
  }, [setEdges, scheduleSave])

  const updateName = useCallback((name) => {
    setOrchestration((prev) => (prev ? { ...prev, name } : prev))
    if (orchestrationRef.current) orchestrationRef.current.name = name
    scheduleSave()
  }, [scheduleSave])

  const updateStatus = useCallback((status) => {
    setOrchestration((prev) => (prev ? { ...prev, status } : prev))
    if (orchestrationRef.current) orchestrationRef.current.status = status
    scheduleSave()
  }, [scheduleSave])

  const updateObjectiveField = useCallback((field, value) => {
    setObjectivePackage((prev) => {
      const next = {
        ...prev,
        [field]: field === 'runtimeLimitMinutes' || field === 'budgetUsd'
          ? normalizeNumber(value, prev[field])
          : value,
      }
      const objectiveValidation = validateObjectivePackage(next, { requireComplete: false })
      setObjectiveErrors(objectiveValidation.errors)
      return next
    })
  }, [])

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null
  const selectedEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : null
  const approvals = Array.isArray(runtimeGraph?.approvals) ? runtimeGraph.approvals : []

  return {
    orchestration,
    loading,
    saving,
    dirty,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeId,
    setSelectedEdgeId,
    selectedNode,
    selectedEdge,
    addAgentNode,
    removeNode,
    onConnect,
    removeEdge,
    updateEdgePolicy,
    updateName,
    updateStatus,
    saveNow,
    scheduleSave,
    validation,
    executionHistory,
    currentExecutionId,
    setCurrentExecutionId,
    execution,
    runtimeGraph,
    timeline,
    mutations,
    approvals,
    runtimeBusyAction,
    runtimeMessage,
    runtimeError,
    publishedVersion,
    loopState,
    objectivePackage,
    objectiveErrors,
    conversation,
    tasks,
    reassignments,
    validateDefinition,
    publishVersion,
    executeVersion,
    sendConversationMessage,
    pauseExecution,
    resumeExecution,
    cancelExecution,
    mutateExecution,
    retryFailedNode,
    replayFromNode,
    submitApprovalDecision,
    createTimedReassignment,
    cancelTimedReassignment,
    updateObjectiveField,
    exportExecutionSnapshot,
    loadExecutionSnapshot,
    loadExecutionHistory,
  }
}
