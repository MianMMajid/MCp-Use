function collectChunks(buffer, onChunk) {
  const lines = buffer.split('\n')
  const remainder = lines.pop() ?? ''

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    const data = line.slice(6).trim()
    if (!data || data === '[DONE]') continue
    try {
      const payload = JSON.parse(data)
      const chunk = payload.content || payload.reply || payload.text || ''
      if (chunk) onChunk(chunk)
    } catch {
      onChunk(data)
    }
  }

  return remainder
}

export async function requestMonitoringChat(prompt, signal) {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    credentials: 'same-origin',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: String(prompt ?? '') }] }),
  })

  if (!response.ok) {
    throw new Error(`Monitoring chat request failed (${response.status})`)
  }

  if (!response.body) {
    const payload = await response.json().catch(() => ({}))
    return payload?.reply ?? payload?.content ?? payload?.text ?? ''
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = collectChunks(buffer, (chunk) => {
      fullText += chunk
    })
  }

  return fullText
}

export function buildMonitoringQuickPrompts({ executionId = '', sessionId = '', routeTitle = '' } = {}) {
  const focusSuffix = routeTitle ? ` for ${routeTitle}` : ''
  const contextSuffix = [sessionId, executionId].filter(Boolean).length
    ? ` (session ${sessionId || '--'}, execution ${executionId || '--'})`
    : ''

  return [
    `Summarize the current risk posture${focusSuffix}${contextSuffix}.`,
    `Explain the last blocked or quarantined action${contextSuffix}.`,
    `What should an operator review next${focusSuffix}${contextSuffix}?`,
  ]
}
