function extractMessage(payload) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const candidates = [
    payload.reply,
    payload.answer,
    payload.message,
    payload.content,
    payload.text,
    payload.output,
    payload.result,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }

  return ''
}

async function postFirewallChat(prompt, signal) {
  const response = await fetch('/api/ui/chat/send', {
    method: 'POST',
    credentials: 'same-origin',
    signal,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ message: prompt }),
  })

  if (!response.ok) throw new Error(`/api/ui/chat/send -> ${response.status}`)

  const payload = await response.json().catch(() => ({}))
  const extracted = extractMessage(payload)
  return extracted || 'Firewall chat replied without a message body.'
}

async function postStreamingChat(prompt, signal) {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    credentials: 'same-origin',
    signal,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ message: prompt }),
  })

  if (!response.ok) {
    throw new Error(`/api/chat/stream -> ${response.status}`)
  }

  if (!response.body) {
    const payload = await response.json().catch(() => ({}))
    const extracted = extractMessage(payload)
    return extracted || 'Streaming chat responded without body content.'
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) {
        continue
      }

      const data = line.slice(6).trim()
      if (!data || data === '[DONE]') {
        continue
      }

      try {
        const parsed = JSON.parse(data)
        text += extractMessage(parsed)
      } catch {
        text += data
      }
    }
  }

  const trailing = buffer.trim()
  if (trailing.startsWith('data: ')) {
    text += trailing.slice(6)
  }

  return text.trim() || 'Streaming chat completed without emitted text.'
}

export async function requestMonitoringChat(prompt, signal) {
  try {
    return await postFirewallChat(prompt, signal)
  } catch {
    return postStreamingChat(prompt, signal)
  }
}

export function buildMonitoringQuickPrompts({ executionId = '', sessionId = '', routeTitle = '' }) {
  const targetSuffix = executionId
    ? ` for execution ${executionId}`
    : sessionId
      ? ` for session ${sessionId}`
      : ''
  const routeSuffix = routeTitle ? ` in ${routeTitle}` : ''

  return Object.freeze([
    `Give me a monitoring status update${targetSuffix}${routeSuffix}.`,
    `What risk indicators are trending right now${targetSuffix}?`,
    `Any pending approvals or escalations${targetSuffix}?`,
    `What intervention do you recommend next${targetSuffix}?`,
  ])
}
