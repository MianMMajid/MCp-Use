<script>
  import { onMount, tick } from 'svelte'
  import { browser } from '$app/environment'
  import { humanizeError } from '../utils/error-display.js'
  import MaypleCharacter from './MaypleCharacter.svelte'

  export let authMe = null
  /** @type {string} */ export const executionId = ''
  export let sessionId = ''
  /** @type {string} */ export const routeTitle = ''

  const CHAT_SCROLL_KEY = 'mayple_it_chat_scroll'
  const CHAT_SESSION_KEY = 'mayple_it_chat_session'

  let messages = []
  let message = ''
  let streaming = false
  let streamingText = ''
  let runError = ''
  let scrollContainer
  let abortController = null

  function getChatSessionId() {
    if (sessionId) return sessionId
    if (!browser) return ''
    try {
      let stored = localStorage.getItem(CHAT_SESSION_KEY)
      if (!stored) {
        stored = `it-console-${crypto.randomUUID?.() ?? Date.now().toString(36)}`
        localStorage.setItem(CHAT_SESSION_KEY, stored)
      }
      return stored
    } catch {
      return `it-console-${Date.now().toString(36)}`
    }
  }

  $: showCenteredComposer = messages.length === 0 && !streaming
  $: userName = authMe?.username || authMe?.email?.split('@')[0] || 'You'

  function agentDisplayName() { return 'Mayple' }
  function roleInitial(role) { return role === 'user' ? userName.charAt(0).toUpperCase() : 'M' }
  function roleName(role) { return role === 'user' ? userName : agentDisplayName() }
  function formatTime(ts) {
    if (!ts) return ''
    try { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } catch { return '' }
  }

  let copiedId = ''
  function copyMessage(text, id) {
    if (browser) navigator.clipboard?.writeText(text || '')
    copiedId = id
    setTimeout(() => { copiedId = '' }, 1500)
  }

  $: if (scrollContainer && messages.length > 0) {
    tick().then(() => { scrollContainer.scrollTop = scrollContainer.scrollHeight })
  }

  onMount(() => {
    if (scrollContainer && browser) {
      const stored = Number(localStorage.getItem(CHAT_SCROLL_KEY) || 0)
      if (Number.isFinite(stored) && stored > 0) scrollContainer.scrollTop = stored
    }
  })

  function onScroll(event) {
    if (!browser) return
    localStorage.setItem(CHAT_SCROLL_KEY, String(event.currentTarget.scrollTop || 0))
  }

  function submit() {
    const text = message.trim()
    if (!text || streaming) return
    message = ''
    sendMessage(text).catch(() => {})
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() }
  }

  async function sendMessage(text) {
    runError = ''
    messages = [...messages, { role: 'user', content: text, timestamp: new Date().toISOString() }]

    streaming = true
    streamingText = ''
    const assistantIdx = messages.length
    messages = [...messages, { role: 'assistant', content: '', timestamp: new Date().toISOString(), streaming: true }]

    abortController = new AbortController()
    try {
      const reply = await streamResponse(text, abortController.signal, (chunk) => {
        streamingText += chunk
        messages[assistantIdx] = { ...messages[assistantIdx], content: streamingText }
        messages = messages
      })
      messages[assistantIdx] = { ...messages[assistantIdx], content: reply || streamingText, streaming: false }
      messages = messages
    } catch (err) {
      if (err.name === 'AbortError') {
        messages[assistantIdx] = { ...messages[assistantIdx], content: streamingText || 'Stopped.', streaming: false }
      } else {
        messages[assistantIdx] = { ...messages[assistantIdx], content: 'Unable to reach the monitoring agent.', streaming: false, error: true }
        runError = err instanceof Error ? err.message : 'Request failed.'
      }
      messages = messages
    } finally {
      streaming = false
      abortController = null
    }
  }

  function buildChatRequestBody() {
    const history = messages
      .filter(m => !m.streaming && !m.error && m.content)
      .map(({ role, content }) => ({ role, content }))
    return {
      sessionId: getChatSessionId() || undefined,
      messages: history,
    }
  }

  async function streamResponse(prompt, signal, onChunk) {
    const requestBody = buildChatRequestBody()

    let res
    try {
      res = await fetch('/api/chat/stream', {
        method: 'POST', credentials: 'same-origin', signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      throw new Error('Network error. Check your connection and try again.')
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}))
      const detail = errorBody?.error || errorBody?.message || ''
      if (res.status === 401) throw new Error(detail || 'Authentication required. Please sign in.')
      if (res.status === 403) throw new Error(detail || 'Message blocked by security policy.')
      if (res.status === 503) throw new Error(detail || 'Chat is temporarily unavailable.')
      throw new Error(detail || `Chat request failed (${res.status})`)
    }

    if (!res.body) {
      const payload = await res.json().catch(() => ({}))
      const text = payload?.reply ?? payload?.content ?? payload?.text ?? ''
      if (text) onChunk(text)
      return text
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = '', fullText = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (!data || data === '[DONE]') continue
          try {
            const p = JSON.parse(data)
            const c = p.content || p.reply || p.text || ''
            if (c) { fullText += c; onChunk(c) }
          } catch { if (data !== '[DONE]') { fullText += data; onChunk(data) } }
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      if (fullText) return fullText
      throw new Error('Connection lost during response.')
    }
    return fullText
  }

  function stopStreaming() { abortController?.abort() }
</script>

<section class="workspace">
  <div class="messages" bind:this={scrollContainer} on:scroll={onScroll}>
    <div class="stream">
      {#if showCenteredComposer}
        <div class="empty-state">
          <div class="empty-mascot">
            <MaypleCharacter size={72} />
          </div>
          <h2>How can Mayple help?</h2>
          <p class="empty-sub">Ask about firewall posture, risk analysis, pending approvals, trace investigations, or intervention recommendations.</p>

          <div class="empty-composer">
            <div class="composer-shell">
              <div class="composer-bottom">
                <textarea
                  class="composer"
                  rows="1"
                  bind:value={message}
                  on:keydown={onKeyDown}
                  placeholder="Ask Mayple..."
                ></textarea>
                {#if message.trim() || streaming}
                  <button type="button" class="send" on:click={submit} disabled={streaming} aria-label="Send">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M14 2L7 9M14 2l-5 12-2-5-5-2 12-5z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                {/if}
              </div>
            </div>
          </div>

        </div>
      {/if}

      {#each messages as item, idx}
        {@const text = item.content || ''}
        {@const msgId = 'msg-' + idx}
        {@const isUser = item.role === 'user'}
        {@const prevSameRole = idx > 0 && messages[idx - 1]?.role === item.role}
        <div class="msg-row" class:msg-user={isUser} class:msg-agent={!isUser} class:msg-grouped={prevSameRole}>
          {#if !prevSameRole}
            <span class="msg-avatar">
              {roleInitial(item.role)}
            </span>
          {:else}
            <span class="msg-avatar-spacer"></span>
          {/if}
          <div class="msg-bubble" class:msg-bubble-user={isUser} class:msg-bubble-agent={!isUser}>
            {#if item.streaming && !text}
              <div class="thinking-state">
                <div class="typing-dots"><span></span><span></span><span></span></div>
                <span class="thinking-label">Thinking...</span>
              </div>
            {:else}
              <p>{text}</p>
            {/if}
            <div class="msg-meta">
              {#if item.timestamp}
                <span class="msg-time">{formatTime(item.timestamp)}</span>
              {/if}
              {#if text}
                <button class="msg-copy" title="Copy" aria-label="Copy message" on:click={() => copyMessage(text, msgId)}>
                  {copiedId === msgId ? '✓' : '⎘'}
                </button>
              {/if}
            </div>
            {#if item.error}
              <button type="button" class="retry-btn" on:click={() => { const last = [...messages].reverse().find(m => m.role === 'user'); if (last) { messages = messages.filter(m => !m.error); sendMessage(last.content) } }}>Retry</button>
            {/if}
          </div>
        </div>
      {/each}

      {#if streaming && messages.length > 0 && !messages[messages.length - 1]?.streaming}
        <div class="msg-row msg-agent">
          <span class="msg-avatar">M</span>
          <div class="msg-bubble msg-bubble-agent">
            <div class="thinking-state">
              <div class="typing-dots"><span></span><span></span><span></span></div>
              <span class="thinking-label">Thinking...</span>
            </div>
          </div>
        </div>
      {/if}

      {#if runError}
        <div class="error">
          <span>⚠</span>
          <span>{humanizeError(runError)}</span>
        </div>
      {/if}
    </div>
  </div>

  {#if !showCenteredComposer}
    <footer class="composer-wrap">
      <div class="composer-inner">
        <div class="composer-shell">
          <textarea
            class="composer"
            rows="1"
            bind:value={message}
            on:keydown={onKeyDown}
            placeholder="Ask Mayple..."
            disabled={streaming}
          ></textarea>
          {#if streaming}
            <button type="button" class="send stop" on:click={stopStreaming} aria-label="Stop">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="2" width="10" height="10" rx="1.5"/></svg>
            </button>
          {:else if message.trim()}
            <button type="button" class="send" on:click={submit} aria-label="Send">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M14 2L7 9M14 2l-5 12-2-5-5-2 12-5z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          {/if}
        </div>
      </div>
    </footer>
  {/if}
</section>

<style>
  /* ── Layout — matches Desktop App ChatWorkspace exactly ── */
  .workspace {
    height: 100%;
    display: grid;
    grid-template-rows: 1fr auto;
    overflow: hidden;
  }

  .messages {
    overflow: auto;
    padding: 16px 16px 8px;
  }

  .stream {
    width: min(48rem, 100%);
    min-height: 100%;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-bottom: 16px;
  }

  /* ── Empty state — centered mascot + composer ── */
  .empty-state {
    margin: auto;
    text-align: center;
    color: var(--muted, #71717a);
    padding: 16px;
    display: grid;
    gap: 8px;
    justify-items: center;
  }

  .empty-mascot { margin-bottom: 4px; }
  .empty-state h2 { margin: 0; color: var(--ink, #18181b); font-size: 1.4rem; font-weight: 600; }
  .empty-sub { margin: 0; font-size: 0.88rem; max-width: 380px; line-height: 1.45; }

  .empty-composer {
    width: min(600px, 100%);
    margin-top: 8px;
  }


  /* ── Message rows — ChatGPT-style ── */
  .msg-row { display: flex; align-items: flex-start; gap: 12px; animation: msg-in 0.2s ease-out both; padding: 0 4px; }
  .msg-row.msg-grouped { margin-top: -14px; }
  @keyframes msg-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

  .msg-avatar {
    width: 28px; height: 28px; border-radius: 999px;
    display: grid; place-items: center;
    font-size: 11px; font-weight: 700; flex-shrink: 0; margin-top: 2px;
  }
  .msg-row.msg-agent .msg-avatar { background: var(--ok-soft, rgba(57,163,111,0.12)); color: var(--ok, #39a36f); border: 1px solid var(--ok-border, rgba(57,163,111,0.3)); }
  .msg-row.msg-user .msg-avatar { background: rgba(232,116,12,0.1); color: var(--brand, #e8740c); border: 1px solid rgba(232,116,12,0.25); }
  .msg-avatar-spacer { width: 28px; flex-shrink: 0; }

  .msg-bubble { flex: 1; min-width: 0; padding: 0; position: relative; line-height: 1.6; font-size: 14px; }
  .msg-bubble p { margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--ink, #18181b); }

  .msg-meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; opacity: 0; transition: opacity 0.15s; }
  .msg-row:hover .msg-meta { opacity: 1; }
  .msg-time { font-size: 10px; color: var(--muted, #a1a1aa); }
  .msg-copy {
    width: 20px; height: 20px; border: 0; border-radius: 4px;
    background: transparent; color: var(--muted, #a1a1aa);
    cursor: pointer; display: grid; place-items: center; padding: 0;
    font-size: 12px;
  }
  .msg-copy:hover { color: var(--brand, #e8740c); }

  .retry-btn { all: unset; cursor: pointer; font-size: 0.75rem; color: var(--brand, #e8740c); margin-top: 4px; }
  .retry-btn:hover { text-decoration: underline; }

  /* ── Typing dots ── */
  .typing-dots { display: flex; gap: 4px; align-items: center; padding: 4px 0; }
  .typing-dots span { width: 6px; height: 6px; border-radius: 999px; background: var(--muted, #a1a1aa); animation: typing-bounce 1.2s ease-in-out infinite; }
  .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
  .typing-dots span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes typing-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }

  /* ── Error ── */
  .error {
    border: 1px solid var(--warn-border, rgba(248,113,113,0.3));
    border-radius: 12px;
    background: var(--warn-soft, rgba(248,113,113,0.08));
    padding: 10px 14px;
    color: var(--warn, #ef4444);
    font-size: 13px;
    display: flex; align-items: center; gap: 8px;
    align-self: center;
  }

  /* ── Composer ── */
  .composer-wrap { padding: 8px 16px 12px; }

  .composer-inner {
    width: min(680px, 100%);
    margin: 0 auto;
    display: grid;
    gap: 8px;
  }

  .composer-shell {
    border: 1px solid var(--line, #e4e4e7);
    border-radius: 20px;
    background: var(--bg-soft, #fafafa);
    display: flex;
    align-items: flex-end;
    padding: 10px 14px 6px;
    transition: border-color 0.2s;
  }
  .composer-shell:focus-within { border-color: var(--brand, #e8740c); }

  .composer-bottom { display: flex; align-items: flex-end; gap: 6px; width: 100%; }

  .composer {
    flex: 1;
    min-height: 22px;
    max-height: 160px;
    border: 0;
    background: transparent;
    padding: 8px 0;
    resize: none;
    outline: none;
    font-size: 14px;
    font-family: inherit;
    color: var(--ink, #18181b);
  }
  .composer::placeholder { color: var(--muted, #a1a1aa); }

  .send {
    width: 32px; height: 32px;
    border: none; border-radius: 999px;
    background: var(--brand, #e8740c); color: #fff;
    display: grid; place-items: center;
    cursor: pointer; flex-shrink: 0;
    transition: background 0.15s, transform 0.1s;
  }
  .send:hover { background: var(--brand-strong, #c55d00); }
  .send:active { transform: scale(0.94); }
  .send:disabled { opacity: 0.5; cursor: not-allowed; }
  .send.stop { background: var(--warn, #ef4444); }
  .send.stop:hover { background: #dc2626; }

  @media (prefers-reduced-motion: reduce) {
    .msg-row { animation: none; }
    .typing-dots span { animation: none; }
  }
</style>
