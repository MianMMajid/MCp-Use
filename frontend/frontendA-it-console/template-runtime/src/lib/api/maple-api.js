function defaultHeaders(headers = {}) {
  return {
    Accept: 'application/json',
    ...headers,
  }
}

export async function loadJson(fetcher, path, options = {}) {
  const response = await fetcher(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: defaultHeaders(options.headers),
  })
  if (!response.ok) {
    throw new Error(`${path} -> ${response.status}`)
  }
  return response.json()
}

export async function sendJson(fetcher, path, body = {}, options = {}) {
  const response = await fetcher(path, {
    method: 'POST',
    credentials: 'same-origin',
    ...options,
    headers: defaultHeaders({
      'Content-Type': 'application/json',
      ...options.headers,
    }),
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `${path} -> ${response.status}`)
  }
  return payload
}

export async function loadMany(fetcher, requests) {
  const entries = await Promise.all(
    requests.map(async ([key, path, options]) => {
      try {
        const value = await loadJson(fetcher, path, options)
        return [key, { ok: true, value }]
      } catch (error) {
        return [
          key,
          {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
        ]
      }
    }),
  )

  return Object.fromEntries(entries)
}

export function pickItems(payload, keys = ['items', 'entries', 'events', 'approvals', 'executions', 'sessions']) {
  if (Array.isArray(payload)) {
    return payload
  }
  if (!payload || typeof payload !== 'object') {
    return []
  }
  for (const key of keys) {
    if (Array.isArray(payload[key])) {
      return payload[key]
    }
  }
  return []
}

export function getValue(payload, fallback = null) {
  return payload && typeof payload === 'object' ? payload : fallback
}
