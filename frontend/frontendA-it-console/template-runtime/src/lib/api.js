const DEFAULT_TIMEOUT_MS = 15_000
const MUTATE_TIMEOUT_MS = 60_000

function fetchWithTimeout(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)

  // If an external signal is provided, abort our controller when it fires
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

export async function loadJson(path, { signal } = {}) {
  const res = await fetchWithTimeout(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

export async function postJson(path, body) {
  const res = await fetchWithTimeout(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, MUTATE_TIMEOUT_MS)
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

export async function patchJson(path, body) {
  const res = await fetchWithTimeout(path, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, MUTATE_TIMEOUT_MS)
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

export async function deleteJson(path) {
  const res = await fetchWithTimeout(path, {
    method: 'DELETE',
    credentials: 'same-origin',
  }, MUTATE_TIMEOUT_MS)
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}
