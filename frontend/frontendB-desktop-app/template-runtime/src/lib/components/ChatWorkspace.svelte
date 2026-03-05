<script>
  import { onMount } from 'svelte';
  import { chatStore } from '@/lib/stores/chat-store';
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
  $: currentMessages = isOrchestration ? ($chatStore.orchestrationConversation || []) : ($chatStore.messages || []);
  $: showCenteredComposer = currentMessages.length === 0 && !$chatStore.streaming;

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
      <ModelSelectorPill />
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
    </div>
  </header>

  <div class="messages" bind:this={scrollContainer} on:scroll={onScroll}>
    <div class="stream">
      {#if showCenteredComposer}
        <div class="empty-state">
          <h2>{isOrchestration ? 'Start orchestration conversation' : 'How can Mayple help today?'}</h2>
          <p>
            {isOrchestration
              ? 'Define objective, success criteria, and reassignment instructions.'
              : 'Start a conversation. Messages route through the selected target.'}
          </p>
          <div class="floating-wrap">
            <div class="composer-shell floating">
              <textarea
                class="composer"
                rows="1"
                bind:value={message}
                on:keydown={onKeyDown}
                placeholder={isOrchestration
                  ? 'Describe the objective, assign timed tasks, or update constraints...'
                  : 'Send a message...'}
              ></textarea>
              <button class="send" on:click={submit} aria-label="Send"><Icon name="send" size={17} /></button>
            </div>
          </div>
        </div>
      {/if}

      {#if isOrchestration}
        {#each $chatStore.orchestrationConversation as item}
          <article class="bubble" class:user={item.role === 'user'}>
            <strong>{item.role}</strong>
            <p>{item.text}</p>
          </article>
        {/each}
      {:else}
        {#each $chatStore.messages as item}
          <article class="bubble" class:user={item.role === 'user'}>
            <strong>{item.role}</strong>
            <p>{item.content}</p>
          </article>
        {/each}
      {/if}

      {#if $chatStore.runError && !isOrchestration}
        <div class="error">{$chatStore.runError}</div>
      {/if}
      {#if $chatStore.orchestrationError && isOrchestration}
        <div class="error">{$chatStore.orchestrationError}</div>
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
        <button class="send" on:click={submit} aria-label="Send"><Icon name="send" size={17} /></button>
      </div>
    </footer>
  {/if}
</section>

<style>
  .workspace {
    height: calc(100svh - 24px);
    display: grid;
    grid-template-rows: auto 1fr auto;
    border-radius: 28px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: linear-gradient(180deg, rgba(14, 18, 24, 0.78), rgba(9, 12, 18, 0.78));
    backdrop-filter: blur(18px);
    overflow: hidden;
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    min-height: 68px;
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
    padding: 22px 16px;
  }

  .empty-state h2 {
    margin: 0;
    color: var(--fg);
    font-size: 1.65rem;
    font-weight: 560;
  }

  .empty-state p {
    margin: 8px 0 0;
    font-size: 1rem;
  }

  .floating-wrap {
    margin-top: 16px;
  }

  .bubble {
    max-width: 760px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 24px;
    background: rgba(28, 33, 43, 0.8);
    padding: 12px 15px;
  }

  .bubble.user {
    align-self: flex-end;
    border-color: rgba(249, 115, 22, 0.36);
    background: rgba(249, 115, 22, 0.16);
  }

  .bubble p {
    margin: 6px 0 0;
    line-height: 1.45;
    white-space: pre-wrap;
  }

  .error {
    border: 1px solid rgba(251, 113, 133, 0.35);
    border-radius: 14px;
    background: rgba(251, 113, 133, 0.12);
    padding: 10px 12px;
    color: #fecdd3;
    font-size: 13px;
  }

  .composer-wrap {
    padding: 8px 16px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .composer-shell {
    width: min(900px, 100%);
    margin: 0 auto;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 28px;
    background: rgba(19, 23, 31, 0.9);
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
    border: 1px solid rgba(249, 115, 22, 0.56);
    border-radius: 999px;
    background: rgba(249, 115, 22, 0.2);
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
