async function parseJsonSafely(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

function buildError(message, options = {}) {
  const error = new Error(message)
  error.stepUpRequired = Boolean(options.stepUpRequired)
  error.payload = options.payload ?? null
  return error
}

function detectStepUp(payload, fallbackMessage) {
  if (payload?.stepUpRequired === true) {
    return true
  }
  const message = String(payload?.message ?? fallbackMessage ?? '').toLowerCase()
  return message.includes('step-up') || message.includes('challenge token')
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })

  const payload = await parseJsonSafely(response)
  if (!response.ok) {
    const message = payload?.message || `${path} -> ${response.status}`
    throw buildError(message, {
      stepUpRequired: detectStepUp(payload, message),
      payload,
    })
  }
  return payload
}

function withChallengeToken(payload, challengeToken) {
  if (!challengeToken) {
    return payload
  }
  return {
    ...payload,
    challengeToken,
  }
}

function requireId(value, name) {
  if (!value) throw new Error(`${name} is required`)
}

export function interventionActionCatalog() {
  return {
    pauseExecution: {
      label: 'Pause',
      destructive: false,
      execute: ({ executionId, challengeToken }) => {
        requireId(executionId, 'executionId')
        return postJson(
          `/api/orchestrations/executions/${encodeURIComponent(executionId)}/pause`,
          withChallengeToken({}, challengeToken),
        )
      },
    },
    resumeExecution: {
      label: 'Resume',
      destructive: false,
      execute: ({ executionId, challengeToken }) => {
        requireId(executionId, 'executionId')
        return postJson(
          `/api/orchestrations/executions/${encodeURIComponent(executionId)}/resume`,
          withChallengeToken({}, challengeToken),
        )
      },
    },
    cancelExecution: {
      label: 'Cancel',
      destructive: true,
      requiresReason: true,
      execute: ({ executionId, reason, challengeToken }) => {
        requireId(executionId, 'executionId')
        return postJson(
          `/api/orchestrations/executions/${encodeURIComponent(executionId)}/cancel`,
          withChallengeToken({ reason }, challengeToken),
        )
      },
    },
    retryNode: {
      label: 'Retry Node',
      destructive: false,
      execute: ({ executionId, nodeId, challengeToken }) => {
        requireId(executionId, 'executionId')
        return postJson(
          `/api/orchestrations/executions/${encodeURIComponent(executionId)}/retry-node`,
          withChallengeToken({ nodeId }, challengeToken),
        )
      },
    },
    replayNode: {
      label: 'Replay Node',
      destructive: false,
      execute: ({ executionId, nodeId, challengeToken }) => {
        requireId(executionId, 'executionId')
        return postJson(
          `/api/orchestrations/executions/${encodeURIComponent(executionId)}/replay-from-node`,
          withChallengeToken({ nodeId }, challengeToken),
        )
      },
    },
    approveDecision: {
      label: 'Approve',
      destructive: false,
      execute: ({ executionId, approvalId, challengeToken }) => {
        requireId(executionId, 'executionId')
        return postJson(
          `/api/orchestrations/executions/${encodeURIComponent(executionId)}/approvals/${encodeURIComponent(approvalId)}/decision`,
          withChallengeToken({ action: 'approve' }, challengeToken),
        )
      },
    },
    rejectDecision: {
      label: 'Reject',
      destructive: true,
      requiresReason: true,
      execute: ({ executionId, approvalId, reason, challengeToken }) => {
        requireId(executionId, 'executionId')
        return postJson(
          `/api/orchestrations/executions/${encodeURIComponent(executionId)}/approvals/${encodeURIComponent(approvalId)}/decision`,
          withChallengeToken({ action: 'reject', reason }, challengeToken),
        )
      },
    },
    escalate: {
      label: 'Escalate',
      destructive: false,
      execute: ({ executionId, sessionId, reason, challengeToken }) =>
        postJson(
          '/api/operations/orchestrations/escalation/escalate',
          withChallengeToken({ executionId, sessionId, reason }, challengeToken),
        ),
    },
    executeBreakGlass: {
      label: 'Break-glass',
      destructive: true,
      requiresReason: true,
      execute: ({ executionId, sessionId, reason, challengeToken }) =>
        postJson(
          '/api/operations/orchestrations/break-glass',
          withChallengeToken({ executionId, sessionId, reason }, challengeToken),
        ),
    },
    reviewBreakGlass: {
      label: 'Review Break-glass',
      destructive: false,
      execute: ({ breakGlassReviewId, reason, challengeToken }) => {
        requireId(breakGlassReviewId, 'breakGlassReviewId')
        return postJson(
          `/api/operations/orchestrations/break-glass/${encodeURIComponent(breakGlassReviewId)}/review`,
          withChallengeToken({ reason }, challengeToken),
        )
      },
    },
    requestStepUp: {
      label: 'Step-up Challenge',
      destructive: false,
      execute: ({ executionId, sessionId }) =>
        postJson('/api/operations/orchestrations/step-up/challenge', { executionId, sessionId }),
    },
    verifyStepUp: {
      label: 'Step-up Verify',
      destructive: false,
      execute: ({ executionId, sessionId, challengeToken }) =>
        postJson('/api/operations/orchestrations/step-up/verify', {
          executionId,
          sessionId,
          challengeToken,
        }),
    },
    cancelSession: {
      label: 'Stop Session',
      destructive: true,
      requiresReason: true,
      execute: ({ sessionId, reason, challengeToken }) => {
        requireId(sessionId, 'sessionId')
        return postJson(
          `/api/openclaw/agent/sessions/${encodeURIComponent(sessionId)}/cancel`,
          withChallengeToken({ reason }, challengeToken),
        )
      },
    },
  }
}

export function supportsAction(actionName) {
  const catalog = interventionActionCatalog()
  return Object.prototype.hasOwnProperty.call(catalog, actionName)
}
