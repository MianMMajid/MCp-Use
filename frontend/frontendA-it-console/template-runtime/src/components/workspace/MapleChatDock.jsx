'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const MAX_CHAT_MESSAGES = 40
function buildQuickPrompts({ executionId, sessionId }) {
  const targetSuffix = executionId
    ? ` for execution ${executionId}`
    : sessionId
      ? ` for session ${sessionId}`
      : ''
  return Object.freeze([
    `Give me a monitoring status update${targetSuffix}.`,
    `Why was this trace blocked${targetSuffix}?`,
    `What intervention should we run next${targetSuffix}?`,
    `Summarize current guardrail posture${targetSuffix}.`,
  ])
}

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

function trimMessages(messages) {
  if (messages.length <= MAX_CHAT_MESSAGES) {
    return messages
  }
  return messages.slice(messages.length - MAX_CHAT_MESSAGES)
}

async function postFirewallChat(prompt, signal) {
  const response = await fetch('/api/firewall/chat', {
    method: 'POST',
    credentials: 'same-origin',
    signal,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ message: prompt }),
  })

  if (!response.ok) {
    throw new Error(`/api/firewall/chat -> ${response.status}`)
  }

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

export function MapleChatDock({ routeRecord, executionId = '', sessionId = '' }) {
  const [messages, setMessages] = useState(() => [
    {
      id: 'initial',
      role: 'assistant',
      content: 'Ask Mayple about policy, risk, or runtime posture.',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef(null)
  const quickPrompts = useMemo(
    () => buildQuickPrompts({ executionId, sessionId }),
    [executionId, sessionId],
  )

  const visibleMessages = useMemo(() => messages.slice(-8), [messages])

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort()
      }
    }
  }, [])

  const appendMessage = (nextMessage) => {
    setMessages((prev) => trimMessages([...prev, nextMessage]))
  }

  const sendPrompt = async (rawPrompt) => {
    const prompt = String(rawPrompt ?? '').trim()
    if (!prompt || busy) {
      return
    }

    setBusy(true)
    setError('')
    const requestId = `${Date.now()}`
    const controller = new AbortController()
    abortRef.current = controller

    appendMessage({ id: `user-${requestId}`, role: 'user', content: prompt })
    setInput('')

    try {
      let reply
      try {
        reply = await postFirewallChat(prompt, controller.signal)
      } catch {
        reply = await postStreamingChat(prompt, controller.signal)
      }

      appendMessage({ id: `assistant-${requestId}`, role: 'assistant', content: reply })
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Unable to reach chat endpoints.'
      setError(message)
      appendMessage({
        id: `assistant-${requestId}`,
        role: 'assistant',
        content: 'Chat is unavailable right now. Continue using the route controls while we reconnect.',
      })
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  return (
    <section className="mw-chat-dock" data-testid="maple-chat-dock">
      <div className="mw-chat-header">
        <h2>Control Chat</h2>
        <p>{routeRecord?.title ?? 'Workspace'} context</p>
      </div>

      <div className="mw-chat-log" role="log" aria-live="polite">
        {visibleMessages.map((message) => (
          <article key={message.id} className={`mw-chat-bubble mw-chat-bubble-${message.role}`}>
            <p>{message.content}</p>
          </article>
        ))}
      </div>

      <div className="mw-chat-prompts">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="mw-chat-prompt"
            onClick={() => sendPrompt(prompt)}
            disabled={busy}
          >
            {prompt}
          </button>
        ))}
      </div>

      <form
        className="mw-chat-form"
        onSubmit={(event) => {
          event.preventDefault()
          sendPrompt(input)
        }}
      >
        <label htmlFor="mw-chat-input" className="sr-only">
          Ask Mayple
        </label>
        <input
          id="mw-chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={`Ask Mayple about ${routeRecord?.title ?? 'this route'}${executionId ? ` (execution ${executionId})` : ''}...`}
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? 'Sending...' : 'Send'}
        </button>
      </form>

      {error ? <p className="mw-chat-error">{error}</p> : null}
    </section>
  )
}
