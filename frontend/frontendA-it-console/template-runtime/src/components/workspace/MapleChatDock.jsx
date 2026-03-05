'use client'

import { useEffect, useRef, useState } from 'react'

import { requestMonitoringChat } from '../../lib/maple-workspace/monitoring-chat.js'

const MAX_CHAT_MESSAGES = 80

function trimMessages(messages) {
  if (messages.length <= MAX_CHAT_MESSAGES) {
    return messages
  }
  return messages.slice(messages.length - MAX_CHAT_MESSAGES)
}

export function MapleChatDock({
  routeRecord,
  panelOpen = true,
  presetPrompt = '',
  onPresetPromptHandled,
}) {
  const [messages, setMessages] = useState(() => [
    {
      id: 'initial',
      role: 'assistant',
      content: 'Mayple is ready. Ask for monitoring context or intervention guidance.',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef(null)

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort()
      }
    }
  }, [])

  const appendMessage = (nextMessage) => {
    setMessages((previous) => trimMessages([...previous, nextMessage]))
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
      const reply = await requestMonitoringChat(prompt, controller.signal)
      appendMessage({ id: `assistant-${requestId}`, role: 'assistant', content: reply })
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Unable to reach chat endpoints.'
      setError(message)
      appendMessage({
        id: `assistant-${requestId}`,
        role: 'assistant',
        content:
          'Chat is unavailable right now. Continue operating with the intervention controls while reconnecting.',
      })
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  useEffect(() => {
    if (!presetPrompt) {
      return
    }
    sendPrompt(presetPrompt)
    onPresetPromptHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetPrompt])

  return (
    <>
      <div
        id="firewallChatLog"
        className={`chat-log chat-log-home ${panelOpen ? 'hidden' : ''}`}
        data-testid="maple-chat-dock"
      >
        {messages.map((message) => (
          <article
            key={message.id}
            className={`chat-bubble ${message.role === 'user' ? 'user' : 'assistant'}`}
          >
            <p>{message.content}</p>
          </article>
        ))}
      </div>

      <div className="chat-composer chat-composer-home">
        <div className="chat-input-row">
          <div className="chat-input-wrap">
            <input
              id="firewallChatInput"
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder=""
              autoComplete="off"
              aria-label="Chat message"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  sendPrompt(input)
                }
              }}
            />
            <span
              className={`rotating-placeholder ${input.trim() ? 'is-hidden' : ''}`}
              id="rotatingPlaceholder"
            >
              Ask Mayple about {routeRecord?.title ?? 'operations'}...
            </span>
            <button
              id="firewallChatSendBtn"
              className="chat-send-btn"
              type="button"
              aria-label="Send"
              disabled={busy || !input.trim()}
              onClick={() => sendPrompt(input)}
            >
              <svg viewBox="0 0 24 24">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="status error">{error}</p> : null}
    </>
  )
}
