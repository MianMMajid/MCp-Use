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

export async function loadJson(path) {
  const res = await fetchWithTimeout(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
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
