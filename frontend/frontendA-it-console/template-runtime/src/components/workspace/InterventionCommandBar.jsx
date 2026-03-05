'use client'

import { useEffect, useMemo, useState } from 'react'

import { interventionActionCatalog } from '../../lib/maple-workspace/intervention-api.js'

const TARGET_STORAGE_KEY = 'mayple_workspace_target_v1'

function readStoredTarget() {
  if (typeof window === 'undefined') {
    return { executionId: '', sessionId: '' }
  }
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(TARGET_STORAGE_KEY) ?? '{}')
    return {
      executionId: typeof parsed.executionId === 'string' ? parsed.executionId : '',
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : '',
    }
  } catch {
    return { executionId: '', sessionId: '' }
  }
}

function persistTarget(target) {
  if (typeof window === 'undefined') {
    return
  }
  window.sessionStorage.setItem(
    TARGET_STORAGE_KEY,
    JSON.stringify({
      executionId: target.executionId ?? '',
      sessionId: target.sessionId ?? '',
    }),
  )
}

function asErrorMessage(error) {
  if (error instanceof Error) {
    return error.message
  }
  return String(error ?? 'Request failed.')
}

function ActionButton({ label, onClick, disabled, danger = false }) {
  return (
    <button
      type="button"
      className={`mw-intervention-action ${danger ? 'mw-intervention-action-danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  )
}

export function InterventionCommandBar({
  executionId = '',
  sessionId = '',
  compact = false,
  onTargetChange,
}) {
  const actions = useMemo(() => interventionActionCatalog(), [])
  const [target, setTarget] = useState(() => ({
    executionId: '',
    sessionId: '',
    nodeId: '',
    approvalId: '',
    breakGlassReviewId: '',
    reason: '',
    challengeToken: '',
  }))
  const [busyAction, setBusyAction] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [stepUpRequired, setStepUpRequired] = useState(false)
  const [confirmState, setConfirmState] = useState({ actionName: '', open: false })

  useEffect(() => {
    const stored = readStoredTarget()
    setTarget((prev) => ({
      ...prev,
      executionId: executionId || stored.executionId || prev.executionId,
      sessionId: sessionId || stored.sessionId || prev.sessionId,
    }))
  }, [executionId, sessionId])

  useEffect(() => {
    persistTarget({
      executionId: target.executionId,
      sessionId: target.sessionId,
    })
    onTargetChange?.({
      executionId: target.executionId,
      sessionId: target.sessionId,
    })
  }, [target.executionId, target.sessionId, onTargetChange])

  const currentTargetLabel =
    target.executionId || target.sessionId
      ? `Execution ${target.executionId || 'unset'} • Session ${target.sessionId || 'unset'}`
      : 'No execution/session target selected'

  async function runAction(actionName) {
    const action = actions[actionName]
    if (!action) {
      return
    }

    if (action.requiresReason && !target.reason.trim()) {
      setError('Reason is required for this action.')
      return
    }
    if (stepUpRequired && actionName !== 'requestStepUp' && !target.challengeToken.trim()) {
      setError('Challenge token is required. Request and verify step-up first.')
      return
    }

    setBusyAction(actionName)
    setError('')
    setNotice('')

    try {
      await action.execute({
        executionId: target.executionId.trim(),
        sessionId: target.sessionId.trim(),
        nodeId: target.nodeId.trim(),
        approvalId: target.approvalId.trim(),
        reason: target.reason.trim(),
        breakGlassReviewId: target.breakGlassReviewId.trim(),
        challengeToken: target.challengeToken.trim(),
      })
      setStepUpRequired(false)
      setNotice(`${action.label} completed.`)
      if (actionName === 'requestStepUp') {
        setNotice('Step-up challenge requested. Enter token and run verify.')
      }
      if (actionName === 'verifyStepUp') {
        setNotice('Step-up token verified. Intervention actions unlocked.')
      }
    } catch (requestError) {
      setError(asErrorMessage(requestError))
      if (requestError?.stepUpRequired) {
        setStepUpRequired(true)
      }
    } finally {
      setBusyAction('')
      setConfirmState({ actionName: '', open: false })
    }
  }

  function triggerAction(actionName) {
    const action = actions[actionName]
    if (!action) {
      return
    }
    if (action.destructive) {
      setConfirmState({ actionName, open: true })
      return
    }
    runAction(actionName)
  }

  return (
    <section className={`mw-intervention ${compact ? 'mw-intervention-compact' : ''}`}>
      <header className="mw-intervention-header">
        <h2>Intervention Command Bar</h2>
        <span className="mw-source-badge">Source: Frontend B orchestration runtime</span>
      </header>
      <p className="mw-intervention-target">{currentTargetLabel}</p>

      <div className="mw-intervention-inputs">
        <label>
          Execution ID
          <input
            value={target.executionId}
            onChange={(event) => setTarget((prev) => ({ ...prev, executionId: event.target.value }))}
            placeholder="exec-123"
            autoComplete="off"
          />
        </label>
        <label>
          Session ID
          <input
            value={target.sessionId}
            onChange={(event) => setTarget((prev) => ({ ...prev, sessionId: event.target.value }))}
            placeholder="session-123"
            autoComplete="off"
          />
        </label>
        <label>
          Node ID
          <input
            value={target.nodeId}
            onChange={(event) => setTarget((prev) => ({ ...prev, nodeId: event.target.value }))}
            placeholder="node-5"
            autoComplete="off"
          />
        </label>
        <label>
          Approval ID
          <input
            value={target.approvalId}
            onChange={(event) => setTarget((prev) => ({ ...prev, approvalId: event.target.value }))}
            placeholder="approval-1"
            autoComplete="off"
          />
        </label>
        <label>
          Break-glass Review ID
          <input
            value={target.breakGlassReviewId}
            onChange={(event) =>
              setTarget((prev) => ({ ...prev, breakGlassReviewId: event.target.value }))
            }
            placeholder="bg-evt-1"
            autoComplete="off"
          />
        </label>
      </div>

      <div className="mw-intervention-inputs">
        <label className="mw-intervention-full">
          Reason (required for destructive actions)
          <textarea
            value={target.reason}
            onChange={(event) => setTarget((prev) => ({ ...prev, reason: event.target.value }))}
            rows={2}
            placeholder="Explain why this intervention is required."
          />
        </label>
        <label>
          Challenge Token
          <input
            value={target.challengeToken}
            onChange={(event) =>
              setTarget((prev) => ({ ...prev, challengeToken: event.target.value }))
            }
            placeholder={stepUpRequired ? 'Required due to step-up challenge' : 'Optional'}
            autoComplete="off"
          />
        </label>
      </div>

      <div className="mw-intervention-actions">
        <ActionButton
          label="Pause"
          onClick={() => triggerAction('pauseExecution')}
          disabled={!target.executionId.trim() || Boolean(busyAction)}
        />
        <ActionButton
          label="Resume"
          onClick={() => triggerAction('resumeExecution')}
          disabled={!target.executionId.trim() || Boolean(busyAction)}
        />
        <ActionButton
          label="Cancel"
          onClick={() => triggerAction('cancelExecution')}
          disabled={!target.executionId.trim() || Boolean(busyAction)}
          danger
        />
        <ActionButton
          label="Retry Node"
          onClick={() => triggerAction('retryNode')}
          disabled={!target.executionId.trim() || !target.nodeId.trim() || Boolean(busyAction)}
        />
        <ActionButton
          label="Replay Node"
          onClick={() => triggerAction('replayNode')}
          disabled={!target.executionId.trim() || !target.nodeId.trim() || Boolean(busyAction)}
        />
        <ActionButton
          label="Approve"
          onClick={() => triggerAction('approveDecision')}
          disabled={!target.executionId.trim() || !target.approvalId.trim() || Boolean(busyAction)}
        />
        <ActionButton
          label="Reject"
          onClick={() => triggerAction('rejectDecision')}
          disabled={!target.executionId.trim() || !target.approvalId.trim() || Boolean(busyAction)}
          danger
        />
        <ActionButton
          label="Escalate"
          onClick={() => triggerAction('escalate')}
          disabled={(!target.executionId.trim() && !target.sessionId.trim()) || Boolean(busyAction)}
        />
        <ActionButton
          label="Break-glass"
          onClick={() => triggerAction('executeBreakGlass')}
          disabled={(!target.executionId.trim() && !target.sessionId.trim()) || Boolean(busyAction)}
          danger
        />
        <ActionButton
          label="Review Break-glass"
          onClick={() => triggerAction('reviewBreakGlass')}
          disabled={!target.breakGlassReviewId.trim() || Boolean(busyAction)}
        />
        <ActionButton
          label="Step-up Challenge"
          onClick={() => triggerAction('requestStepUp')}
          disabled={(!target.executionId.trim() && !target.sessionId.trim()) || Boolean(busyAction)}
        />
        <ActionButton
          label="Step-up Verify"
          onClick={() => triggerAction('verifyStepUp')}
          disabled={
            (!target.executionId.trim() && !target.sessionId.trim()) ||
            !target.challengeToken.trim() ||
            Boolean(busyAction)
          }
        />
        <ActionButton
          label="Stop Session"
          onClick={() => triggerAction('cancelSession')}
          disabled={!target.sessionId.trim() || Boolean(busyAction)}
          danger
        />
      </div>

      {busyAction ? <p className="mw-intervention-notice">Running {actions[busyAction]?.label}...</p> : null}
      {notice ? <p className="mw-intervention-notice">{notice}</p> : null}
      {error ? <p className="mw-intervention-error">{error}</p> : null}

      {confirmState.open ? (
        <div className="mw-intervention-confirm">
          <div className="mw-intervention-confirm-card">
            <h3>Confirm destructive action</h3>
            <p>
              {actions[confirmState.actionName]?.label} will modify runtime behavior. A reason is
              required before proceeding.
            </p>
            <div className="mw-intervention-confirm-actions">
              <button
                type="button"
                onClick={() => runAction(confirmState.actionName)}
                disabled={!target.reason.trim() || Boolean(busyAction)}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmState({ actionName: '', open: false })}
                disabled={Boolean(busyAction)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
