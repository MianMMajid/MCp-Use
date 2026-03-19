const GET_TIMEOUT_MS = 30_000
const MUTATE_TIMEOUT_MS = 120_000
const STREAMING_MAX_MS = 5 * 60_000 // 5 minute max lifetime for streaming connections
const STREAMING_PATH_PATTERNS = ['/hitl/approvals/watch', '/chat/stream', '/events/stream', '/sse']

// Hop-by-hop headers that must not be forwarded (RFC 2616 §13.5.1)
const HOP_BY_HOP = new Set([
  'host', 'connection', 'keep-alive', 'transfer-encoding',
  'te', 'trailer', 'upgrade', 'proxy-authorization', 'proxy-authenticate',
])

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
    if (HOP_BY_HOP.has(key.toLowerCase())) continue
    next.set(key, value)
  }
  return next
}

function generateRequestId() {
  return crypto.randomUUID()
}

function errorResponse(status, error, requestId) {
  return new Response(JSON.stringify({ error, request_id: requestId }), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
  })
}

async function proxyRequest({ request, fetch, targetUrl }) {
  const requestId = request.headers.get('x-request-id') || generateRequestId()
  const isGet = request.method === 'GET' || request.method === 'HEAD'
  const proxiedHeaders = cloneHeaders(request.headers)
  proxiedHeaders.set('X-Request-Id', requestId)
  proxiedHeaders.set('X-Forwarded-Proto', new URL(request.url).protocol.replace(':', ''))
  proxiedHeaders.set('X-Forwarded-Host', new URL(request.url).host)

  const init = {
    method: request.method,
    headers: proxiedHeaders,
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
        return errorResponse(504, 'Gateway timeout', requestId)
      }
      return errorResponse(502, 'Bad gateway', requestId)
    }
    clearTimeout(timeoutId)

    const respHeaders = new Headers(response.headers)
    respHeaders.delete('content-encoding')
    respHeaders.delete('content-length')
    respHeaders.set('X-Request-Id', requestId)

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
    })
  }

  // Streaming request — long timeout to cap connection lifetime, catch network errors
  const controller = new AbortController()
  const streamTimeoutId = setTimeout(() => controller.abort(), STREAMING_MAX_MS)
  init.signal = controller.signal

  const proxyStart = Date.now()
  console.log(`[proxy] streaming fetch start: ${targetUrl}`)
  let response
  try {
    response = await fetch(targetUrl, init)
  } catch (err) {
    console.log(`[proxy] streaming fetch failed after ${Date.now() - proxyStart}ms:`, err.name)
    clearTimeout(streamTimeoutId)
    if (err.name === 'AbortError') {
      return errorResponse(504, 'Gateway timeout', requestId)
    }
    return errorResponse(502, 'Bad gateway', requestId)
  }
  console.log(`[proxy] streaming fetch resolved in ${Date.now() - proxyStart}ms, status: ${response.status}`)

  const respHeaders = new Headers(response.headers)
  respHeaders.delete('content-encoding')
  respHeaders.delete('content-length')
  respHeaders.set('X-Request-Id', requestId)

  // Wrap the body to clear the timeout when the stream ends
  const upstream = response.body
  const passthrough = new ReadableStream({
    async start(ctrl) {
      const reader = upstream.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          ctrl.enqueue(value)
        }
        ctrl.close()
      } catch (err) {
        ctrl.error(err)
      } finally {
        clearTimeout(streamTimeoutId)
      }
    },
    cancel() {
      clearTimeout(streamTimeoutId)
    },
  })

  return new Response(passthrough, {
    status: response.status,
    statusText: response.statusText,
    headers: respHeaders,
  })
}

export { proxyRequest }
