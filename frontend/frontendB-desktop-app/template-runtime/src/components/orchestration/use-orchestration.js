'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useChat } from '@/contexts/chat-context'
import { loadJson, patchJson } from '@/lib/api'
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
  const saveTimerRef = useRef(null)
  const orchestrationRef = useRef(null)

  // Load orchestration on mount
  useEffect(() => {
    if (!orchestrationId) return
    let cancelled = false
    setLoading(true)
    loadJson(`/api/orchestrations/${orchestrationId}`)
      .then((data) => {
        if (cancelled) return
        setOrchestration(data)
        orchestrationRef.current = data

        // Convert stored nodes to ReactFlow format, enriched with agent data
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

        // Convert stored edges to ReactFlow format
        const rfEdges = (data.edges ?? []).map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'delegationEdge',
          data: { delegationPolicy: e.delegationPolicy ?? { ...DEFAULT_DELEGATION_POLICY } },
        }))
        setEdges(rfEdges)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [orchestrationId, agents, setNodes, setEdges])

  // Auto-save debounce
  const scheduleSave = useCallback(() => {
    setDirty(true)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveNow()
    }, 1500)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Extract storable format from ReactFlow state
  const getStorableData = useCallback(() => {
    const storeNodes = nodes.map((n) => ({
      id: n.id,
      agentId: n.data?.agentId,
      position: n.position,
    }))
    const storeEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      delegationPolicy: e.data?.delegationPolicy ?? { ...DEFAULT_DELEGATION_POLICY },
    }))
    return { nodes: storeNodes, edges: storeEdges }
  }, [nodes, edges])

  // Save function
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
      if (res.ok) {
        const data = await res.json()
        setOrchestration(data)
        orchestrationRef.current = data
        setDirty(false)
      }
    } catch {
      // ignore save errors silently
    } finally {
      setSaving(false)
    }
  }, [orchestrationId, getStorableData])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // Add agent node to canvas
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

  // Remove node
  const removeNode = useCallback((nodeId) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId))
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId))
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
    scheduleSave()
  }, [setNodes, setEdges, selectedNodeId, scheduleSave])

  // Connect handler
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

  // Remove edge
  const removeEdge = useCallback((edgeId) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId))
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null)
    scheduleSave()
  }, [setEdges, selectedEdgeId, scheduleSave])

  // Update edge policy
  const updateEdgePolicy = useCallback((edgeId, policy) => {
    setEdges((prev) =>
      prev.map((e) =>
        e.id === edgeId
          ? { ...e, data: { ...e.data, delegationPolicy: policy } }
          : e
      )
    )
    scheduleSave()
  }, [setEdges, scheduleSave])

  // Update name
  const updateName = useCallback((name) => {
    setOrchestration((prev) => prev ? { ...prev, name } : prev)
    if (orchestrationRef.current) orchestrationRef.current.name = name
    scheduleSave()
  }, [scheduleSave])

  // Update status
  const updateStatus = useCallback((status) => {
    setOrchestration((prev) => prev ? { ...prev, status } : prev)
    if (orchestrationRef.current) orchestrationRef.current.status = status
    scheduleSave()
  }, [scheduleSave])

  // Derived state
  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null
  const selectedEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : null

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
  }
}
