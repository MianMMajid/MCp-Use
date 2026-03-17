<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { chatStore } from '@/lib/stores/chat-store';
  import { toastStore } from '@/lib/stores/toast-store';
  import Icon from '@/lib/components/icons/Icon.svelte';
  import MaypleCharacter from '@/lib/components/MaypleCharacter.svelte';
  import SelectorPill from '@/lib/components/ui/SelectorPill.svelte';
  import ModelSelectorPill from '@/lib/components/ui/ModelSelectorPill.svelte';

  const CHAT_SCROLL_KEY = 'mayple_chat_scroll_position';

  let message = '';
  let scrollContainer;

  $: agentOptions = ($chatStore.agents || []).map((agent) => ({
    value: String(agent.agentId || agent.id),
    label: agent.name || agent.displayName || agent.id
  }));
  $: agentOptionsWithNone = [{ value: '', label: 'No agent (global chat)' }, ...agentOptions];

  $: orchestrationOptions = ($chatStore.orchestrations || []).map((item) => ({
    value: String(item.id),
    label: item.name || item.id
  }));

  $: routeOptions = [
    { value: 'agent', label: 'Agent' },
    { value: 'orchestration', label: 'Orchestration' }
  ];

  $: isOrchestration = $chatStore.chatTarget === 'orchestration';
  $: showModelSelector = !isOrchestration && !$chatStore.selectedAgentId;
  $: currentMessages = isOrchestration ? ($chatStore.orchestrationConversation || []) : ($chatStore.messages || []);
  $: showCenteredComposer = currentMessages.length === 0 && !$chatStore.streaming;
  $: isStreaming = $chatStore.streaming || $chatStore.busy;
  $: hasAgents = ($chatStore.agents || []).length > 0;

  const quickPrompts = [
    'Give me a firewall status update',
    'What should we do to reduce risk?',
    'Show me recent agent activity',
    'Which traces were blocked today?',
  ];

  function agentDisplayName() {
    if ($chatStore.selectedAgent) return $chatStore.selectedAgent.name || 'Agent';
    return 'Mayple';
  }

  function roleName(role) {
    if (role === 'user') return 'You';
    return agentDisplayName();
  }

  function roleInitial(role) {
    if (role === 'user') return 'U';
    return agentDisplayName().charAt(0).toUpperCase();
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    try {
      return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch { return ''; }
  }

  let copiedId = '';
  function copyMessage(text, id) {
    navigator.clipboard?.writeText(text || '');
    copiedId = id;
    toastStore.info('Copied to clipboard');
    setTimeout(() => { copiedId = ''; }, 1500);
  }

  $: if (scrollContainer && currentMessages.length > 0) {
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }

  onMount(() => {
    if (scrollContainer) {
      const stored = Number(window.localStorage.getItem(CHAT_SCROLL_KEY) || 0);
      if (Number.isFinite(stored) && stored > 0) {
        scrollContainer.scrollTop = stored;
      }
    }
  });

  function submit() {
    const text = message.trim();
    if (!text) return;
    chatStore.sendMessage(text);
    message = '';
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function onScroll(event) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CHAT_SCROLL_KEY, String(event.currentTarget.scrollTop || 0));
  }
</script>

<section class="workspace">
  <div class="messages" bind:this={scrollContainer} on:scroll={onScroll}>
    <div class="stream">
      {#if showCenteredComposer}
        <div class="empty-state">
          <div class="empty-mascot">
            <MaypleCharacter size={72} />
          </div>
          <h2>{isOrchestration ? 'Start orchestration' : 'How can Mayple help?'}</h2>
          <p class="empty-sub">
            {isOrchestration
              ? 'Define an objective, assign agents, and let Mayple coordinate.'
              : 'Ask a question, run a command, or explore your agent stack.'}
          </p>

          <!-- Selectors — centered in empty state -->
          <div class="selector-row">
            {#if showModelSelector}
              <ModelSelectorPill />
            {/if}
            {#if isOrchestration}
              <SelectorPill
                label="Orchestration"
                icon="orchestration"
                value={$chatStore.selectedOrchestrationId}
                options={orchestrationOptions.length ? orchestrationOptions : [{ value: '', label: 'No orchestrations' }]}
                on:change={(e) => chatStore.selectOrchestration(e.detail)}
              />
            {:else}
              <SelectorPill
                label="Agent"
                icon="agent"
                value={$chatStore.selectedAgentId}
                options={agentOptionsWithNone}
                on:change={(e) => chatStore.selectAgent(e.detail)}
              />
            {/if}
            <SelectorPill
              label="Mode"
              icon="chat"
              value={$chatStore.chatTarget}
              options={routeOptions}
              on:change={(e) => chatStore.setChatTarget(e.detail)}
            />
          </div>

          {#if !isOrchestration && !hasAgents}
            <div class="first-time-cta">
              <p class="cta-hint">Get started by creating your first agent</p>
              <button class="pill cta-btn" on:click={() => goto('/orchestrate')}>
                Open Builder →
              </button>
            </div>
          {/if}
        </div>
      {:else}
        <!-- Selectors — compact row at top of message stream -->
        <div class="stream-selectors">
          {#if showModelSelector}
            <ModelSelectorPill />
          {/if}
          {#if isOrchestration}
            <SelectorPill
              label="Orchestration"
              icon="orchestration"
              value={$chatStore.selectedOrchestrationId}
              options={orchestrationOptions.length ? orchestrationOptions : [{ value: '', label: 'No orchestrations' }]}
              on:change={(e) => chatStore.selectOrchestration(e.detail)}
            />
          {:else}
            <SelectorPill
              label="Agent"
              icon="agent"
              value={$chatStore.selectedAgentId}
              options={agentOptionsWithNone}
              on:change={(e) => chatStore.selectAgent(e.detail)}
            />
          {/if}
          <SelectorPill
            label="Mode"
            icon="chat"
            value={$chatStore.chatTarget}
            options={routeOptions}
            on:change={(e) => chatStore.setChatTarget(e.detail)}
          />
        </div>
      {/if}

      {#each currentMessages as item, idx}
        {@const text = item.content || item.text || ''}
        {@const msgId = 'msg-' + idx}
        {@const isUser = item.role === 'user'}
        {@const prevSameRole = idx > 0 && currentMessages[idx - 1]?.role === item.role}
        <div class="msg-row" class:msg-user={isUser} class:msg-agent={!isUser} class:msg-grouped={prevSameRole}>
          {#if !prevSameRole}
            <span class="msg-avatar">
              {roleInitial(item.role)}
            </span>
          {:else}
            <span class="msg-avatar-spacer"></span>
          {/if}
          <div class="msg-bubble" class:msg-bubble-user={isUser} class:msg-bubble-agent={!isUser}>
            <p>{text}</p>
            <div class="msg-meta">
              {#if item.timestamp || item.createdAt}
                <span class="msg-time">{formatTime(item.timestamp || item.createdAt)}</span>
              {/if}
              <button class="msg-copy" title="Copy" aria-label="Copy message" on:click={() => copyMessage(text, msgId)}>
                <Icon name={copiedId === msgId ? 'check' : 'copy'} size={11} />
              </button>
            </div>
          </div>
        </div>
      {/each}

      {#if isStreaming}
        <div class="msg-row msg-agent">
          <span class="msg-avatar">{agentDisplayName().charAt(0)}</span>
          <div class="msg-bubble msg-bubble-agent msg-tail">
            <div class="typing-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      {/if}

      {#if $chatStore.runError && !isOrchestration}
        <div class="error">
          <Icon name="alert" size={14} />
          <span>{$chatStore.runError}</span>
        </div>
      {/if}
      {#if $chatStore.orchestrationError && isOrchestration}
        <div class="error">
          <Icon name="alert" size={14} />
          <span>{$chatStore.orchestrationError}</span>
        </div>
      {/if}
    </div>
  </div>

  <footer class="composer-wrap">
    <div class="composer-inner">
      <div class="composer-shell" class:floating={showCenteredComposer}>
        <textarea
          class="composer"
          rows="1"
          bind:value={message}
          on:keydown={onKeyDown}
          placeholder={isOrchestration ? 'Describe the objective...' : 'Ask Mayple...'}
        ></textarea>
        {#if message.trim() || isStreaming}
          <button type="button" class="send" on:click={submit} disabled={isStreaming} aria-label="Send">
            <Icon name="send" size={15} />
          </button>
        {/if}
      </div>
      {#if showCenteredComposer && !isOrchestration && hasAgents}
        <div class="suggestions">
          {#each quickPrompts as prompt}
            <button class="suggestion-chip" on:click={() => { message = prompt; submit(); }}>
              {prompt}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </footer>
</section>

<style>
  .workspace {
    height: calc(100svh - 92px);
    display: grid;
    grid-template-rows: 1fr auto;
    overflow: hidden;
  }

  .messages {
    overflow: auto;
    padding: 16px 16px 8px;
  }

  /* ── Selector rows ── */
  .selector-row {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 12px;
    margin-bottom: 4px;
  }

  .stream-selectors {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 0 4px 12px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 12px;
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

  .empty-state {
    margin: auto 0;
    text-align: center;
    color: var(--muted);
    padding: 32px 16px;
    display: grid;
    gap: 8px;
    justify-items: center;
  }

  .empty-mascot { margin-bottom: 8px; }
  .empty-state h2 { margin: 0; color: var(--fg); font-size: 1.4rem; font-weight: 600; }
  .empty-sub { margin: 0; font-size: 0.88rem; max-width: 340px; line-height: 1.45; }

  /* ── ChatGPT-style centered messages ── */
  .msg-row { display: flex; align-items: flex-start; gap: 12px; animation: msg-in 0.2s ease-out both; padding: 0 4px; }
  .msg-row.msg-grouped { margin-top: -14px; }
  @keyframes msg-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .msg-avatar { width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center; font-size: 11px; font-weight: 700; flex-shrink: 0; margin-top: 2px; }
  .msg-row.msg-agent .msg-avatar { background: var(--ok-soft); color: var(--ok); border: 1px solid var(--ok-border); }
  .msg-row.msg-user .msg-avatar { background: var(--accent-soft); color: var(--accent); border: 1px solid rgba(232,116,12,0.25); }
  .msg-avatar-spacer { width: 28px; flex-shrink: 0; }
  .msg-bubble { flex: 1; min-width: 0; padding: 0; position: relative; line-height: 1.6; font-size: 14px; }
  .msg-bubble p { margin: 0; white-space: pre-wrap; word-break: break-word; }
  .msg-bubble-user p { color: var(--fg); }
  .msg-meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; opacity: 0; transition: opacity 0.15s; }
  .msg-row:hover .msg-meta { opacity: 1; }
  .msg-time { font-size: 10px; color: var(--muted); }
  .msg-copy { width: 20px; height: 20px; border: 0; border-radius: 4px; background: transparent; color: var(--muted); cursor: pointer; display: grid; place-items: center; padding: 0; }
  .msg-copy:hover { color: var(--accent); }
  .typing-dots { display: flex; gap: 4px; align-items: center; padding: 4px 0; }
  .typing-dots span { width: 6px; height: 6px; border-radius: 999px; background: var(--muted); animation: typing-bounce 1.2s ease-in-out infinite; }
  .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
  .typing-dots span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes typing-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }
  .error { border: 1px solid var(--danger-border); border-radius: 12px; background: var(--danger-soft); padding: 10px 14px; color: var(--danger); font-size: 13px; display: flex; align-items: center; gap: 8px; align-self: center; }

  .first-time-cta {
    margin-top: 16px;
    display: grid;
    gap: 10px;
    justify-items: center;
  }

  .cta-hint {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }

  .cta-btn {
    padding: 10px 20px;
    border-color: transparent;
    background: var(--accent);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .cta-btn:hover {
    background: var(--accent-strong);
  }

  .composer-wrap {
    padding: 8px 16px 12px;
  }

  .composer-inner {
    width: min(680px, 100%);
    margin: 0 auto;
    display: grid;
    gap: 8px;
  }

  .composer-shell {
    border: 1px solid var(--border);
    border-radius: 24px;
    background: var(--bg-soft);
    display: flex;
    gap: 6px;
    align-items: flex-end;
    padding: 6px 6px 6px 16px;
    transition: border-color 0.2s;
  }

  .composer-shell:focus-within {
    border-color: var(--accent);
  }

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
  }

  .send {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    display: grid;
    place-items: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, transform 0.1s;
  }

  .send:hover { background: var(--accent-strong); }
  .send:active { transform: scale(0.94); }
  .send:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Suggestion chips (below composer) ── */
  .suggestions {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 0 2px 2px;
    scrollbar-width: none;
  }

  .suggestions::-webkit-scrollbar { display: none; }

  .suggestion-chip {
    flex-shrink: 0;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--btn-secondary-bg);
    color: var(--fg);
    padding: 7px 14px;
    font-size: 12px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    white-space: nowrap;
  }

  .suggestion-chip:hover {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }

  @media (max-width: 480px) {
    .selector-row,
    .stream-selectors {
      gap: 6px;
    }
  }

  @media (max-width: 900px) {
    .workspace {
      border-radius: 20px;
    }
  }
</style>
