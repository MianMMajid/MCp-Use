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
  $: agentOptionsWithNone = [{ value: '', label: 'Governed Path' }, ...agentOptions];

  $: orchestrationOptions = ($chatStore.orchestrations || []).map((item) => ({
    value: String(item.id),
    label: item.name || item.id
  }));

  $: routeOptions = [
    { value: 'agent', label: 'Agent' },
    { value: 'orchestration', label: 'Orchestration' }
  ];
  $: isOrchestration = $chatStore.chatTarget === 'orchestration';
  $: showModelSelector = false;
  $: currentMessages = isOrchestration ? ($chatStore.orchestrationConversation || []) : ($chatStore.messages || []);
  $: showCenteredComposer = currentMessages.length === 0 && !$chatStore.streaming;
  $: isStreaming = $chatStore.streaming || $chatStore.busy;
  $: busyStatus = $chatStore.busyStatus || '';
  $: hasAgents = ($chatStore.agents || []).length > 0;

  function formatCost(cost) {
    if (!cost) return null;
    if (typeof cost === 'number') return `$${cost.toFixed(4)}`;
    if (cost.totalUsd) return `$${Number(cost.totalUsd).toFixed(4)}`;
    if (cost.inputTokens || cost.outputTokens) {
      const parts = [];
      if (cost.inputTokens) parts.push(`${cost.inputTokens} in`);
      if (cost.outputTokens) parts.push(`${cost.outputTokens} out`);
      return parts.join(' · ');
    }
    return null;
  }


  function agentDisplayName() {
    if ($chatStore.selectedAgent) return $chatStore.selectedAgent.name || 'Agent';
    return 'Mayple';
  }

  function roleName(role) {
    if (role === 'user') return 'You';
    return agentDisplayName();
  }

  function renderMessage(text, stripImages = false) {
    // Escape HTML first to prevent XSS
    let safe = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    // Render or strip markdown images: ![alt](url)
    if (stripImages) {
      // Strip markdown images when attachments render them separately
      safe = safe.replace(/!\[([^\]]*)\]\([^\s)]+\)/g, '');
    } else {
      safe = safe.replace(/!\[([^\]]*)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g,
        '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;margin:8px 0;" loading="lazy" />');
    }
    // Render markdown links: [text](url)
    safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">$1</a>');
    // Render bold: **text**
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return safe;
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

          <!-- Composer with inline suggestions -->
          <div class="empty-composer">
            <div class="composer-shell">
              <div class="composer-bottom">
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
            </div>
          </div>

          <!-- GPT + Agent/Mode selectors — below input -->
          <div class="below-selectors">
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

          {#if hasAgents && !$chatStore.selectedAgentId && !isOrchestration}
            <div class="agent-prompt-banner">
              <Icon name="agent" size={16} />
              <span>Select an agent above to get started, or chat globally.</span>
            </div>
          {/if}

          {#if !isOrchestration && !hasAgents}
            <div class="first-time-cta">
              <p class="cta-hint">Get started by creating your first agent</p>
              <button class="pill cta-btn" on:click={() => goto('/agents')}>
                Create Agent →
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
            <SelectorPill
              label="Runtime"
              icon="spark"
              value={selectedRuntime}
              options={runtimeOptions}
              disabled={!$chatStore.selectedAgentId}
              on:change={(e) => chatStore.setSelectedAgentRuntime(e.detail)}
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
        {@const isTrace = item.role === 'trace' || item.role === 'system' || item.type === 'trace'}
        {@const prevSameRole = idx > 0 && currentMessages[idx - 1]?.role === item.role}

        {#if isTrace}
          <!-- Orchestration execution trace step -->
          <div class="trace-step">
            <div class="trace-dot"></div>
            <div class="trace-body">
              <span class="trace-label">{item.agentName || item.nodeId || 'System'}</span>
              <span class="trace-text">{text}</span>
              {#if item.status}
                <span class="trace-badge" class:trace-ok={item.status === 'completed'} class:trace-running={item.status === 'running'} class:trace-err={item.status === 'failed'}>{item.status}</span>
              {/if}
            </div>
          </div>
        {:else}
          <div class="msg-row" class:msg-user={isUser} class:msg-agent={!isUser} class:msg-grouped={prevSameRole}>
            {#if !prevSameRole}
              <span class="msg-avatar">
                {roleInitial(item.role)}
              </span>
            {:else}
              <span class="msg-avatar-spacer"></span>
            {/if}
            <div class="msg-bubble" class:msg-bubble-user={isUser} class:msg-bubble-agent={!isUser}>
              {#if isUser}
                <p>{text}</p>
              {:else}
                {@const hasImageAttachments = item.attachments?.some(a => a.type === 'image')}
                <p>{@html renderMessage(text, hasImageAttachments)}</p>
                {#if item.attachments}
                  {#each item.attachments as att}
                    {#if att.type === 'image' && att.url}
                      <img src={att.url} alt={att.alt || att.name || ''} style="max-width:100%;border-radius:8px;margin:8px 0;" loading="lazy" />
                    {/if}
                  {/each}
                {/if}
              {/if}
              <div class="msg-meta">
                {#if item.timestamp || item.createdAt}
                  <span class="msg-time">{formatTime(item.timestamp || item.createdAt)}</span>
                {/if}
                {#if !isUser && formatCost(item.cost)}
                  <span class="msg-cost">{formatCost(item.cost)}</span>
                {/if}
                <button class="msg-copy" title="Copy" aria-label="Copy message" on:click={() => copyMessage(text, msgId)}>
                  <Icon name={copiedId === msgId ? 'check' : 'copy'} size={11} />
                </button>
              </div>
            </div>
          </div>
        {/if}
      {/each}

      {#if isStreaming}
        <div class="msg-row msg-agent">
          <span class="msg-avatar">{agentDisplayName().charAt(0)}</span>
          <div class="msg-bubble msg-bubble-agent msg-tail">
            <div class="thinking-status">
              <div class="typing-dots">
                <span></span><span></span><span></span>
              </div>
              {#if busyStatus}
                <span class="status-text">{busyStatus}</span>
              {/if}
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

  {#if !showCenteredComposer}
    <footer class="composer-wrap">
      <div class="composer-inner">
        <div class="composer-shell">
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
      </div>
    </footer>
  {/if}
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

  .empty-composer {
    width: min(600px, 100%);
    margin-top: 8px;
  }

  .below-selectors {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 6px;
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
    margin: auto;
    text-align: center;
    color: var(--muted);
    padding: 16px;
    display: grid;
    gap: 8px;
    justify-items: center;
  }

  .empty-mascot { margin-bottom: 4px; }
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
  /* ── Thinking status ── */
  .thinking-status { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
  .typing-dots { display: flex; gap: 4px; align-items: center; }
  .typing-dots span { width: 6px; height: 6px; border-radius: 999px; background: var(--muted); animation: typing-bounce 1.2s ease-in-out infinite; }
  .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
  .typing-dots span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes typing-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }
  .status-text { font-size: 12px; color: var(--muted); font-style: italic; animation: status-fade 0.3s ease-out; }
  @keyframes status-fade { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; transform: translateX(0); } }

  /* ── Cost display ── */
  .msg-cost { font-size: 10px; color: var(--muted); background: var(--glass); border: 1px solid var(--border); border-radius: 6px; padding: 1px 5px; }

  /* ── Orchestration trace steps ── */
  .trace-step { display: flex; align-items: flex-start; gap: 10px; padding: 0 4px; animation: msg-in 0.2s ease-out both; }
  .trace-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--info); border: 2px solid var(--info-soft); margin-top: 5px; flex-shrink: 0; }
  .trace-body { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--muted); padding: 4px 0; border-bottom: 1px solid var(--border); flex: 1; }
  .trace-label { font-weight: 600; color: var(--fg); }
  .trace-text { flex: 1; min-width: 0; }
  .trace-badge { font-size: 10px; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--border); }
  .trace-ok { color: var(--ok); border-color: var(--ok-border); background: var(--ok-soft); }
  .trace-running { color: var(--info); border-color: var(--info-border); background: var(--info-soft); }
  .trace-err { color: var(--danger); border-color: var(--danger-border); background: var(--danger-soft); }

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
    border-radius: 20px;
    background: var(--bg-soft);
    display: flex;
    flex-direction: column;
    padding: 10px 14px 6px;
    transition: border-color 0.2s;
  }

  .composer-shell:focus-within {
    border-color: var(--accent);
  }

  .composer-shell .composer {
    width: 100%;
  }

  .composer-bottom {
    display: flex;
    align-items: flex-end;
    gap: 6px;
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


  @media (max-width: 480px) {
    .stream-selectors {
      gap: 6px;
    }
  }

  .agent-prompt-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border: 1px dashed rgba(249,115,22,.5);
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--muted);
    font-size: 13px;
  }

  @media (max-width: 900px) {
    .workspace {
      border-radius: 20px;
    }
  }
</style>
