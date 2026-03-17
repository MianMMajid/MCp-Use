import { deleteJson, loadJson, patchJson, postJson } from '@/lib/api'

async function parseApiResponse(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) {
    const message = payload?.error || payload?.details || `Request failed (${response.status})`
    throw new Error(message)
  }
  return payload
}

export async function listOrchestrationTemplates() {
  const payload = await loadJson('/api/orchestrations/templates')
  return Array.isArray(payload?.items) ? payload.items : []
}

export async function listOrchestrations() {
  const payload = await loadJson('/api/orchestrations')
  return Array.isArray(payload?.items) ? payload.items : []
}

export async function getOrchestration(orchestrationId) {
  const payload = await loadJson(`/api/orchestrations/${orchestrationId}`)
  return payload?.orchestration ?? payload
}

export async function createFromOrchestrationTemplate(templateId, body = {}) {
  const response = await postJson(`/api/orchestrations/templates/${templateId}/create`, body)
  return parseApiResponse(response)
}

export async function getOrchestrationConversation(orchestrationId) {
  const payload = await loadJson(`/api/orchestrations/${orchestrationId}/conversation`)
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    objectivePackage: payload?.objectivePackage || null,
  }
}

export async function postOrchestrationConversation(orchestrationId, body = {}) {
  const response = await postJson(`/api/orchestrations/${orchestrationId}/conversation`, body)
  return parseApiResponse(response)
}

export async function listOrchestrationExecutions(orchestrationId, limit = 20) {
  const query = new URLSearchParams()
  if (orchestrationId) query.set('orchestrationId', orchestrationId)
  if (limit) query.set('limit', String(limit))
  const payload = await loadJson(`/api/orchestrations/executions?${query.toString()}`)
  return Array.isArray(payload?.items) ? payload.items : []
}

export async function getOrchestrationExecution(executionId) {
  const payload = await loadJson(`/api/orchestrations/executions/${executionId}`)
  return payload?.execution ?? payload
}

export async function getOrchestrationExecutionGraph(executionId) {
  return loadJson(`/api/orchestrations/executions/${executionId}/graph`)
}

export async function getOrchestrationExecutionTimeline(executionId, limit = 200) {
  const payload = await loadJson(`/api/orchestrations/executions/${executionId}/timeline?limit=${limit}`)
  return Array.isArray(payload?.timeline)
    ? payload.timeline
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload)
        ? payload
        : []
}

export async function getOrchestrationExecutionSnapshot(executionId) {
  const payload = await loadJson(`/api/orchestrations/executions/${executionId}/snapshot`)
  if (payload?.ok === false) throw new Error(payload?.error || 'Failed to load execution snapshot')
  return payload
}

export async function executeOrchestration(orchestrationId, body = {}) {
  const response = await postJson(`/api/orchestrations/${orchestrationId}/execute`, body)
  return parseApiResponse(response)
}

export async function pauseOrchestrationExecution(executionId) {
  const response = await postJson(`/api/orchestrations/executions/${executionId}/pause`, {})
  return parseApiResponse(response)
}

export async function resumeOrchestrationExecution(executionId) {
  const response = await postJson(`/api/orchestrations/executions/${executionId}/resume`, {})
  return parseApiResponse(response)
}

export async function cancelOrchestrationExecution(executionId) {
  const response = await postJson(`/api/orchestrations/executions/${executionId}/cancel`, {})
  return parseApiResponse(response)
}

export async function mutateOrchestrationExecution(executionId, body = {}) {
  const response = await postJson(`/api/orchestrations/executions/${executionId}/mutate`, body)
  return parseApiResponse(response)
}

export async function retryOrchestrationNode(executionId, nodeId) {
  const response = await postJson(`/api/orchestrations/executions/${executionId}/retry-node`, { nodeId })
  return parseApiResponse(response)
}

export async function replayOrchestrationFromNode(executionId, nodeId) {
  const response = await postJson(`/api/orchestrations/executions/${executionId}/replay-from-node`, { nodeId })
  return parseApiResponse(response)
}

export async function decideOrchestrationApproval(executionId, approvalId, body = {}) {
  const response = await postJson(
    `/api/orchestrations/executions/${executionId}/approvals/${approvalId}/decision`,
    body,
  )
  return parseApiResponse(response)
}

export async function updateOrchestration(orchestrationId, body = {}) {
  const response = await patchJson(`/api/orchestrations/${orchestrationId}`, body)
  return parseApiResponse(response)
}

export async function deleteOrchestration(orchestrationId) {
  return deleteJson(`/api/orchestrations/${orchestrationId}`)
}

export async function loadExecutionTasks(executionId) {
  const payload = await loadJson(`/api/orchestrations/executions/${executionId}/tasks`)
  return Array.isArray(payload?.items) ? payload.items : []
}

export async function postTaskReassignment(executionId, taskId, body = {}) {
  const response = await postJson(`/api/orchestrations/executions/${executionId}/tasks/${taskId}/reassign`, body)
  return parseApiResponse(response)
}

export async function loadExecutionReassignments(executionId) {
  const payload = await loadJson(`/api/orchestrations/executions/${executionId}/reassignments`)
  return Array.isArray(payload?.items) ? payload.items : []
}

export async function removeExecutionReassignment(executionId, reassignmentId) {
  return deleteJson(`/api/orchestrations/executions/${executionId}/reassignments/${reassignmentId}`)
}
