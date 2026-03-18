const GET_TIMEOUT_MS = 30_000
const MUTATE_TIMEOUT_MS = 120_000
const STREAMING_PATH_PATTERNS = ['/hitl/approvals/watch', '/chat/stream', '/events/stream', '/sse']

function isStreamingRequest(targetUrl) {
  try {
    const pathname = new URL(targetUrl).pathname
    return STREAMING_PATH_PATTERNS.some((p) => pathname.includes(p))
  } catch {
    return false
  }
}

function cloneHeaders(headers) {
  const next = new Headers()
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === 'host') continue
    next.set(key, value)
  }
  return next
}

async function proxyRequest({ request, fetch, targetUrl }) {
  const isGet = request.method === 'GET' || request.method === 'HEAD'
  const init = {
    method: request.method,
    headers: cloneHeaders(request.headers),
    body: isGet ? undefined : await request.arrayBuffer(),
    redirect: 'manual',
  }

  if (!isStreamingRequest(targetUrl)) {
    const controller = new AbortController()
    const timeoutMs = isGet ? GET_TIMEOUT_MS : MUTATE_TIMEOUT_MS
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    init.signal = controller.signal

    let response
    try {
      response = await fetch(targetUrl, init)
    } catch (err) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        return new Response(JSON.stringify({ error: 'Gateway timeout' }), {
          status: 504,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: 'Bad gateway' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    clearTimeout(timeoutId)

    const proxiedHeaders = new Headers(response.headers)
    proxiedHeaders.delete('content-encoding')
    proxiedHeaders.delete('content-length')

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: proxiedHeaders,
    })
  }

  // Streaming request — no timeout, but catch network errors
  let response
  try {
    response = await fetch(targetUrl, init)
  } catch {
    return new Response(JSON.stringify({ error: 'Bad gateway' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const proxiedHeaders = new Headers(response.headers)
  proxiedHeaders.delete('content-encoding')
  proxiedHeaders.delete('content-length')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: proxiedHeaders,
  })
}

export { proxyRequest }
