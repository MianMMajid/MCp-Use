function normalizePathname(pathname) {
  if (!pathname) return '/'
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname
}

function matchPath(pathname, pattern) {
  const path = normalizePathname(pathname)
  const patt = normalizePathname(pattern)
  const pathParts = path.split('/').filter(Boolean)
  const pattParts = patt.split('/').filter(Boolean)
  const params = {}

  if (pathParts.length !== pattParts.length) return null

  for (let i = 0; i < pattParts.length; i += 1) {
    const p = pattParts[i]
    const v = pathParts[i]
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(v)
      continue
    }
    if (p !== v) return null
  }

  return params
}

function nowIso() {
  return new Date().toISOString()
}

function randomDelay() {
  return 1000 + Math.floor(Math.random() * 900)
}

function makeApproval(state) {
  const approvalId = state.nextId('approval')
  return {
    approvalId,
    traceId: `trace-${Date.now()}-${Math.floor(Math.random() * 999)}`,
    stepIndex: Math.floor(Math.random() * 3),
    toolName: Math.random() > 0.5 ? 'delete_record' : 'grant_role',
    action: Math.random() > 0.5 ? 'delete_record' : 'grant_role',
    risk: Math.random() > 0.5 ? 'high' : 'medium',
    description: 'Simulated approval emitted by fake stream.',
    status: 'pending',
    createdAt: nowIso(),
    requestedBy: state.user?.email || 'demo@mayple.dev',
    requiresStepUp: Math.random() > 0.6,
  }
}

function resolveApprovalBucket(pathname, state) {
  if (pathname === '/admin/api/approvals/watch') return { list: state.hitl.adminApprovals, mode: 'wrapped' }
  if (pathname === '/api/hitl/approvals/watch') return { list: state.hitl.gatewayApprovals, mode: 'wrapped' }
  if (pathname === '/api/operations/orchestrations/approvals/stream') return { list: state.hitl.modifierApprovals, mode: 'flat' }
  return null
}

function nextApprovalEvent(pathname, state) {
  const bucket = resolveApprovalBucket(pathname, state)
  if (!bucket) return null

  const { list, mode } = bucket
  const pending = list.filter((item) => item.status === 'pending')

  let action = 'new'
  let approval = null

  if (list.length === 0 || (list.length < 6 && Math.random() < 0.4)) {
    approval = makeApproval(state)
    list.unshift(approval)
    action = 'new'
  } else if (pending.length > 0 && Math.random() < 0.55) {
    approval = pending[Math.floor(Math.random() * pending.length)]
    approval.status = Math.random() > 0.5 ? 'approved' : 'rejected'
    approval.updatedAt = nowIso()
    action = 'update'
  } else {
    const removable = list.find((item) => item.status !== 'pending') || list[list.length - 1]
    if (removable) {
      approval = removable
      action = 'remove'
      const idx = list.findIndex((item) => item.approvalId === removable.approvalId)
      if (idx >= 0) list.splice(idx, 1)
    }
  }

  if (!approval) return null

  if (mode === 'flat') {
    return {
      ...approval,
      eventType: action === 'remove' ? 'resolved' : action,
    }
  }

  return {
    type: action,
    approval,
    traceId: approval.traceId,
    stepIndex: approval.stepIndex,
  }
}

function resolveSession(pathname, state) {
  const params = matchPath(pathname, '/api/openclaw/agent/sessions/:sessionId/stream')
  if (!params) return null
  const session = state.sessions.find(
    (item) => String(item.sessionId) === String(params.sessionId) || String(item.id) === String(params.sessionId),
  )
  return { params, session }
}

function makeMessageEvent(target, type, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  return {
    type,
    data: payload,
    lastEventId: String(Date.now()),
    origin: typeof window === 'undefined' ? '' : window.location.origin,
    target,
    currentTarget: target,
    timeStamp: Date.now(),
  }
}

class FakeEventSource {
  constructor(url, { pathname, state } = {}) {
    this.url = String(url)
    this.readyState = FakeEventSource.CONNECTING
    this.withCredentials = false
    this.onopen = null
    this.onmessage = null
    this.onerror = null
    this._pathname = pathname || '/'
    this._state = state
    this._closed = false
    this._listeners = new Map()
    this._timers = new Set()

    this._open()
  }

  addEventListener(type, listener) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set())
    }
    this._listeners.get(type).add(listener)
  }

  removeEventListener(type, listener) {
    this._listeners.get(type)?.delete(listener)
  }

  close() {
    if (this._closed) return
    this._closed = true
    this.readyState = FakeEventSource.CLOSED
    this._clearTimers()
  }

  _clearTimers() {
    for (const timer of this._timers) {
      clearTimeout(timer)
    }
    this._timers.clear()
  }

  _schedule(fn, delayMs) {
    const timer = setTimeout(() => {
      this._timers.delete(timer)
      fn()
    }, delayMs)
    this._timers.add(timer)
  }

  _dispatch(type, payload) {
    if (this._closed) return
    const event = makeMessageEvent(this, type, payload)
    const listeners = this._listeners.get(type)

    if (type === 'open' && typeof this.onopen === 'function') this.onopen(event)
    if (type === 'message' && typeof this.onmessage === 'function') this.onmessage(event)
    if (type === 'error' && typeof this.onerror === 'function') this.onerror(event)

    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event)
        } catch {
          // Keep stream alive even if UI listener fails.
        }
      }
    }
  }

  _open() {
    this._schedule(() => {
      if (this._closed) return
      this.readyState = FakeEventSource.OPEN
      this._dispatch('open', { ok: true })
      this._startStream()
    }, 25)
  }

  _startStream() {
    const sessionInfo = resolveSession(this._pathname, this._state)
    if (sessionInfo) {
      this._startSessionStream(sessionInfo)
      return
    }

    const approvalBucket = resolveApprovalBucket(this._pathname, this._state)
    if (approvalBucket) {
      this._startApprovalStream()
      return
    }

    this._dispatch('error', { error: 'Unsupported fake stream endpoint.' })
    this.close()
  }

  _startApprovalStream() {
    const emit = () => {
      if (this._closed) return
      const payload = nextApprovalEvent(this._pathname, this._state)
      if (payload) {
        this._dispatch('message', payload)
      }
      this._schedule(emit, randomDelay())
    }

    this._schedule(emit, 150)
  }

  _startSessionStream(sessionInfo) {
    const sessionId = sessionInfo.params.sessionId
    const session = sessionInfo.session
    const steps = [
      'Preparing tools',
      'Running policy checks',
      'Streaming model output',
    ]

    let index = 0

    const emit = () => {
      if (this._closed) return

      if (index < steps.length) {
        const payload = {
          eventType: 'progress',
          type: 'progress',
          sessionId,
          step: index + 1,
          totalSteps: steps.length,
          message: steps[index],
          timestamp: nowIso(),
        }
        session?.events?.push(payload)
        this._dispatch('message', payload)
        index += 1
        this._schedule(emit, randomDelay())
        return
      }

      const done = {
        eventType: 'done',
        type: 'done',
        sessionId,
        message: 'Session stream completed',
        cost: { estimatedCostUsd: Number((Math.random() * 0.03 + 0.01).toFixed(4)) },
        timestamp: nowIso(),
      }
      if (session) {
        session.status = 'completed'
        session.completedAt = nowIso()
        session.events?.push(done)
      }
      this._dispatch('message', done)
      this._dispatch('done', done)
      this.close()
    }

    this._schedule(emit, 180)
  }
}

FakeEventSource.CONNECTING = 0
FakeEventSource.OPEN = 1
FakeEventSource.CLOSED = 2

export function isFakeSsePath(pathname) {
  const normalized = normalizePathname(pathname)
  if (normalized === '/admin/api/approvals/watch') return true
  if (normalized === '/api/hitl/approvals/watch') return true
  if (normalized === '/api/operations/orchestrations/approvals/stream') return true
  return Boolean(matchPath(normalized, '/api/openclaw/agent/sessions/:sessionId/stream'))
}

export function createFakeEventSource({ url, pathname, state }) {
  return new FakeEventSource(url, { pathname, state })
}

export { FakeEventSource }
