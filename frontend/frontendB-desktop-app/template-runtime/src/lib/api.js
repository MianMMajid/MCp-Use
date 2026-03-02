const DEFAULT_TIMEOUT_MS = 15_000

function fetchWithTimeout(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(path, { ...options, signal: controller.signal })
    .then((res) => { clearTimeout(id); return res })
    .catch((err) => {
      clearTimeout(id)
      if (err.name === 'AbortError') throw new Error(`Request timed out: ${path}`)
      throw err
    })
}

const _cache = new Map()
const FRESH_MS   = 30_000
const STALE_MS   = 5 * 60_000
const MAX_ENTRIES = 200

function _evict() {
  if (_cache.size <= MAX_ENTRIES) return
  _cache.delete(_cache.keys().next().value)
}

async function _fetchAndCache(path) {
  const res = await fetchWithTimeout(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  const data = await res.json()
  _cache.set(path, { data, ts: Date.now() })
  _evict()
  return data
}

export async function loadJson(path) {
  const entry = _cache.get(path)
  const now = Date.now()
  if (entry) {
    const age = now - entry.ts
    if (age < FRESH_MS) return entry.data
    if (age < STALE_MS) {
      if (!entry.promise) {
        entry.promise = _fetchAndCache(path)
          .catch(() => {})
          .finally(() => { const e = _cache.get(path); if (e) e.promise = null })
      }
      return entry.data
    }
  }
  return _fetchAndCache(path)
}

export function getCached(path) {
  const entry = _cache.get(path)
  if (!entry) return null
  const age = Date.now() - entry.ts
  if (age < STALE_MS) return entry.data
  return null
}

export function invalidateCache(pathOrPrefix) {
  if (!pathOrPrefix) { _cache.clear(); return }
  for (const key of _cache.keys()) {
    if (key === pathOrPrefix || key.startsWith(pathOrPrefix)) _cache.delete(key)
  }
}

export async function postJson(path, body) {
  const res = await fetchWithTimeout(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res
}

export async function patchJson(path, body) {
  const res = await fetchWithTimeout(path, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res
}

export async function deleteJson(path) {
  const res = await fetchWithTimeout(path, { method: 'DELETE', credentials: 'same-origin' })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

export function connectSSE(url, { onEvent, onError, onDone }) {
  const es = new EventSource(url)
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      if (data.eventType === 'done' || data.type === 'done') {
        onDone?.(data)
        es.close()
      } else {
        onEvent?.(data)
      }
    } catch {
      onEvent?.({ raw: e.data })
    }
  }
  es.addEventListener('done', () => { onDone?.(); es.close() })
  es.onerror = () => { onError?.(); es.close() }
  return { eventSource: es, close: () => es.close() }
}
