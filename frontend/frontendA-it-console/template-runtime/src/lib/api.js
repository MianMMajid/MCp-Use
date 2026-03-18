const DEFAULT_TIMEOUT_MS = 15_000
const MUTATE_TIMEOUT_MS = 60_000
const MAX_RETRIES = 2
const RETRY_BASE_MS = 500
const RETRY_CAP_MS = 5_000

class ApiError extends Error {
  constructor(path, status, detail) {
    super(detail ? `${path} -> ${status}: ${detail}` : `${path} -> ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.path = path
  }
}

function fetchWithTimeout(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)

  const externalSignal = options.signal
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(id)
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  const fetchOptions = { ...options, signal: controller.signal }
  return fetch(path, fetchOptions)
    .then((res) => { clearTimeout(id); return res })
    .catch((err) => {
      clearTimeout(id)
      if (err.name === 'AbortError') throw new Error(`Request timed out: ${path}`)
      throw err
    })
}

function isRetryable(err) {
  if (err.name === 'AbortError') return false
  if (err.status >= 400 && err.status < 500 && err.status !== 429) return false
  return true
}

async function withRetry(fn, retries = MAX_RETRIES) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt >= retries || !isRetryable(err)) throw err
      // Full jitter: random delay between 0 and exponential cap (AWS best practice)
      const maxDelay = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** attempt)
      await new Promise((r) => setTimeout(r, Math.random() * maxDelay))
    }
  }
  throw lastErr
}

async function safeJson(res, path) {
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new ApiError(path, res.status, `Expected JSON but got ${contentType || 'no content-type'}`)
  }
  try {
    return await res.json()
  } catch {
    throw new ApiError(path, res.status, 'Response body is not valid JSON')
  }
}

export async function loadJson(path, { signal } = {}) {
  return withRetry(async () => {
    const res = await fetchWithTimeout(path, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal,
    })
    if (!res.ok) throw new ApiError(path, res.status)
    return safeJson(res, path)
  })
}

// Mutations are not retried by default (not idempotent).
// Callers can pass { retry: true } to opt in if the endpoint is idempotent.
export async function postJson(path, body, { retry = false } = {}) {
  const doFetch = async () => {
    const res = await fetchWithTimeout(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, MUTATE_TIMEOUT_MS)
    if (!res.ok) throw new ApiError(path, res.status)
    return safeJson(res, path)
  }
  return retry ? withRetry(doFetch) : doFetch()
}

export async function patchJson(path, body, { retry = false } = {}) {
  const doFetch = async () => {
    const res = await fetchWithTimeout(path, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, MUTATE_TIMEOUT_MS)
    if (!res.ok) throw new ApiError(path, res.status)
    return safeJson(res, path)
  }
  return retry ? withRetry(doFetch) : doFetch()
}

export async function deleteJson(path, { retry = true } = {}) {
  const doFetch = async () => {
    const res = await fetchWithTimeout(path, {
      method: 'DELETE',
      credentials: 'same-origin',
    }, MUTATE_TIMEOUT_MS)
    if (!res.ok) throw new ApiError(path, res.status)
    return safeJson(res, path)
  }
  return retry ? withRetry(doFetch) : doFetch()
}
