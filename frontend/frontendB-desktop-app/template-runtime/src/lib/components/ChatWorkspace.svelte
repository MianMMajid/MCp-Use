<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { chatStore } from '@/lib/stores/chat-store';
  import { toastStore } from '@/lib/stores/toast-store';
  import Icon from '@/lib/components/icons/Icon.svelte';
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

<section class="workspace card">
  <header class="topbar">
    <div class="topbar-left">
      {#if showModelSelector}
        <ModelSelectorPill />
      {/if}
      <SelectorPill
        label="Agent Selector"
        icon="agent"
        value={$chatStore.selectedAgentId}
        options={agentOptionsWithNone}
        on:change={(e) => chatStore.selectAgent(e.detail)}
      />
      <SelectorPill
        label="Orchestration Selector"
        icon="orchestration"
        value={$chatStore.selectedOrchestrationId}
        options={orchestrationOptions.length ? orchestrationOptions : [{ value: '', label: 'No orchestrations' }]}
        on:change={(e) => chatStore.selectOrchestration(e.detail)}
      />
    </div>

    <div class="topbar-right">
      <SelectorPill
        label="Route"
        icon="chat"
        value={$chatStore.chatTarget}
        options={routeOptions}
        on:change={(e) => chatStore.setChatTarget(e.detail)}
      />
      <button class="profile-btn" aria-label="Profile" on:click={() => goto('/profile')}>
        <Icon name="agent" size={16} />
      </button>
    </div>
  </header>

  <div class="messages" bind:this={scrollContainer} on:scroll={onScroll}>
    <div class="stream">
      {#if showCenteredComposer}
        <div class="empty-state">
          <div class="empty-icon"><Icon name="spark" size={36} /></div>
          <h2>{isOrchestration ? 'Start orchestration' : 'How can Mayple help?'}</h2>
          <p>
            {isOrchestration
              ? 'Define an objective, assign agents, and let Mayple coordinate.'
              : 'Ask a question, run a command, or explore your agent stack.'}
          </p>
          {#if !isOrchestration && !hasAgents}
            <div class="first-time-cta">
              <p class="cta-hint">Get started by creating your first agent</p>
              <button class="pill cta-btn" on:click={() => goto('/orchestrate')}>
                Open Builder →
              </button>
            </div>
          {:else if !isOrchestration}
            <div class="quick-prompts">
              {#each quickPrompts as prompt}
                <button class="quick-prompt" on:click={() => { message = prompt; submit(); }}>
                  {prompt}
                </button>
              {/each}
            </div>
          {/if}
          <div class="floating-wrap">
            <div class="composer-shell floating">
              <textarea
                class="composer"
                rows="1"
                bind:value={message}
                on:keydown={onKeyDown}
                placeholder={isOrchestration
                  ? 'Describe the objective...'
                  : 'Send a message...'}
              ></textarea>
              <button type="button" class="send" on:click={submit} disabled={isStreaming} aria-label="Send"><Icon name="send" size={17} /></button>
            </div>
          </div>
        </div>
      {/if}

      {#each currentMessages as item, idx}
        {@const text = item.content || item.text || ''}
        {@const msgId = 'msg-' + idx}
        <article class="bubble" class:user={item.role === 'user'} class:assistant={item.role !== 'user'}>
          <div class="bubble-header">
            <span class="avatar" class:avatar-user={item.role === 'user'} class:avatar-agent={item.role !== 'user'}>
              {roleInitial(item.role)}
            </span>
            <span class="bubble-name">{roleName(item.role)}</span>
            {#if item.timestamp || item.createdAt}
              <span class="bubble-time">{formatTime(item.timestamp || item.createdAt)}</span>
            {/if}
          </div>
          <div class="bubble-body">
            <p>{text}</p>
          </div>
          <div class="bubble-actions">
            <button class="action-btn" title="Copy" aria-label="Copy message" on:click={() => copyMessage(text, msgId)}>
              <Icon name={copiedId === msgId ? 'check' : 'copy'} size={13} />
            </button>
          </div>
        </article>
      {/each}

      {#if isStreaming}
        <div class="typing-indicator">
          <span class="avatar avatar-agent">{agentDisplayName().charAt(0)}</span>
          <div class="typing-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      {/if}

      {#if $chatStore.runError && !isOrchestration}
        <div class="error">
          <span class="error-icon"><Icon name="alert" size={15} /></span>
          <span>{$chatStore.runError}</span>
        </div>
      {/if}
      {#if $chatStore.orchestrationError && isOrchestration}
        <div class="error">
          <span class="error-icon"><Icon name="alert" size={15} /></span>
          <span>{$chatStore.orchestrationError}</span>
        </div>
      {/if}
    </div>
  </div>

  {#if !showCenteredComposer}
    <footer class="composer-wrap">
      <div class="composer-shell">
        <textarea
          class="composer"
          rows="1"
          bind:value={message}
          on:keydown={onKeyDown}
          placeholder={isOrchestration
            ? 'Describe the objective, assign timed tasks, or update constraints...'
            : 'Send a message...'}
        ></textarea>
        <button type="button" class="send" on:click={submit} disabled={$chatStore.streaming || $chatStore.busy} aria-label="Send"><Icon name="send" size={17} /></button>
      </div>
    </footer>
  {/if}
</section>

<style>
  .workspace {
    height: calc(100svh - 92px); /* 12px top padding + 68px bottom nav space + 12px bottom */
    display: grid;
    grid-template-rows: auto 1fr auto;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--glass);
    backdrop-filter: blur(20px) saturate(180%);
    overflow: hidden;
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 12px 16px 10px;
    border-bottom: 1px solid var(--border);
    min-height: 56px;
  }

  .topbar-left,
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .messages {
    overflow: auto;
    padding: 12px 16px;
  }

  .profile-btn {
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--btn-secondary-bg);
    color: var(--muted);
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 0;
    transition: border-color 0.15s, color 0.15s;
  }

  .profile-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .stream {
    width: min(900px, 100%);
    min-height: 100%;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
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

  .empty-icon {
    font-size: 40px;
    opacity: 0.7;
    margin-bottom: 4px;
  }

  .empty-state h2 {
    margin: 0;
    color: var(--fg);
    font-size: 1.5rem;
    font-weight: 600;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.92rem;
    max-width: 380px;
  }

  .quick-prompts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 12px;
    max-width: 480px;
  }

  .quick-prompt {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--btn-secondary-bg);
    color: var(--fg);
    padding: 10px 12px;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }

  .quick-prompt:hover {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

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
    border-color: rgba(232, 116, 12, 0.5);
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .cta-btn:hover {
    background: rgba(232, 116, 12, 0.2);
  }

  .floating-wrap {
    margin-top: 16px;
    width: 100%;
  }

  /* Messages */
  .bubble {
    max-width: 760px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--bg-elevated);
    padding: 10px 14px;
    position: relative;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    animation: msg-in 0.25s ease-out both;
  }

  @keyframes msg-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .bubble.user {
    align-self: flex-end;
    border-color: rgba(232, 116, 12, 0.28);
    background: rgba(232, 116, 12, 0.10);
  }

  .bubble-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .avatar {
    width: 26px;
    height: 26px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .avatar-user {
    background: var(--accent-soft);
    color: var(--accent);
    border: 1px solid rgba(232, 116, 12, 0.25);
  }

  .avatar-agent {
    background: rgba(57, 163, 111, 0.12);
    color: #39a36f;
    border: 1px solid rgba(57, 163, 111, 0.25);
  }

  .bubble-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--fg);
  }

  .bubble-time {
    font-size: 10px;
    color: var(--muted);
    margin-left: auto;
  }

  .bubble-body p {
    margin: 0;
    line-height: 1.5;
    white-space: pre-wrap;
    font-size: 14px;
  }

  .bubble-actions {
    position: absolute;
    top: 8px;
    right: 8px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .bubble:hover .bubble-actions {
    opacity: 1;
  }

  .action-btn {
    width: 26px;
    height: 26px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-elevated);
    color: var(--muted);
    font-size: 13px;
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 0;
  }

  .action-btn:hover {
    color: var(--accent);
    border-color: var(--accent);
  }

  /* Typing indicator */
  .typing-indicator {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
  }

  .typing-dots {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .typing-dots span {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--muted);
    animation: typing-bounce 1.2s ease-in-out infinite;
  }

  .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
  .typing-dots span:nth-child(3) { animation-delay: 0.3s; }

  @keyframes typing-bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-4px); opacity: 1; }
  }

  /* Error */
  .error {
    border: 1px solid rgba(207, 94, 94, 0.35);
    border-radius: 10px;
    background: rgba(207, 94, 94, 0.08);
    padding: 10px 12px;
    color: var(--warn);
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .error-icon {
    font-size: 15px;
    flex-shrink: 0;
  }

  .composer-wrap {
    padding: 8px 16px 16px;
    border-top: 1px solid var(--border);
  }

  .composer-shell {
    width: min(900px, 100%);
    margin: 0 auto;
    border: 1px solid var(--border);
    border-radius: 22px;
    background: var(--bg-elevated);
    display: flex;
    gap: 8px;
    align-items: flex-end;
    padding: 8px;
  }

  .composer-shell.floating {
    max-width: 760px;
  }

  .composer {
    flex: 1;
    min-height: 24px;
    max-height: 180px;
    border: 0;
    background: transparent;
    padding: 8px 10px;
    resize: none;
    outline: none;
  }

  .send {
    width: 36px;
    height: 36px;
    border: 1px solid var(--accent-strong);
    border-radius: 999px;
    background: linear-gradient(145deg, var(--accent-light), var(--accent));
    color: #fff;
    display: grid;
    place-items: center;
    cursor: pointer;
  }

  @media (max-width: 1140px) {
    .topbar {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }

    .topbar-left,
    .topbar-right {
      flex-wrap: wrap;
    }
  }

  @media (max-width: 900px) {
    .workspace {
      border-radius: 20px;
    }
  }
</style>
