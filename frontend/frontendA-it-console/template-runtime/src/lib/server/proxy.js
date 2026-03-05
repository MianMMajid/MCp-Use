function cloneHeaders(headers) {
  const next = new Headers()
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === 'host') continue
    next.set(key, value)
  }
  return next
}

async function proxyRequest({ request, fetch, targetUrl }) {
  const init = {
    method: request.method,
    headers: cloneHeaders(request.headers),
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
    redirect: 'manual',
  }

  const response = await fetch(targetUrl, init)
  const proxiedHeaders = new Headers(response.headers)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: proxiedHeaders,
  })
}

export { proxyRequest }
