<script>
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { chatStore } from '@/lib/stores/chat-store';
  import { shellStore } from '@/lib/stores/shell-store';
  import { toastStore } from '@/lib/stores/toast-store';
  import { postJson, invalidateCache } from '@/lib/api';
  import Icon from '@/lib/components/icons/Icon.svelte';

  export let open = false;
  export let onClose = () => {};

  let query = '';
  let inputEl;
  let selectedIndex = 0;
  let busy = false;
  let error = '';

  $: isDark = false;
  $: if (typeof $shellStore?.theme === 'string') isDark = $shellStore.theme === 'dark';

  const quickActions = [
    { id: 'new-chat', label: 'New Chat', icon: 'pen', section: 'Actions' },
    { id: 'new-orchestration', label: 'New Orchestration', icon: 'orchestration', section: 'Actions' },
    { id: 'new-agent', label: 'New Agent', icon: 'agent', section: 'Actions' },
    { id: 'toggle-theme', label: 'Toggle Dark Mode', icon: 'moon', section: 'Actions' },
  ];

  const navItems = [
    { id: 'nav-home', label: 'Go to Chat', icon: 'chat', section: 'Navigate', href: '/' },
    { id: 'nav-builder', label: 'Go to Builder', icon: 'builder', section: 'Navigate', href: '/orchestrate' },
    { id: 'nav-firewalls', label: 'Go to Firewalls', icon: 'firewall', section: 'Navigate', href: '/firewalls' },
    { id: 'nav-tasks', label: 'Go to Tasks', icon: 'tasks', section: 'Navigate', href: '/tasks' },
    { id: 'nav-profile', label: 'Settings — Account', icon: 'agent', section: 'Navigate', href: '/profile?tab=account' },
    { id: 'nav-security', label: 'Settings — Security', icon: 'firewall', section: 'Navigate', href: '/profile?tab=security' },
    { id: 'nav-apikeys', label: 'Settings — API Keys', icon: 'skills', section: 'Navigate', href: '/profile?tab=api-keys' },
  ];

  $: sessions = (Array.isArray($chatStore.sessions) ? $chatStore.sessions : [])
    .slice(0, 5)
    .map((s) => ({
      id: 'session-' + (s.sessionId || s.id),
      label: s.title || s.sessionId || 'Untitled',
      icon: 'chat',
      section: 'Recent Sessions',
      sessionId: s.sessionId || s.id,
    }));

  $: agents = (Array.isArray($chatStore.agents) ? $chatStore.agents : [])
    .slice(0, 5)
    .map((a) => ({
      id: 'agent-' + (a.agentId || a.id),
      label: a.name || a.agentId || a.id,
      icon: 'agent',
      section: 'Agents',
      agentId: a.agentId || a.id,
    }));

  $: allItems = [...quickActions, ...sessions, ...agents, ...navItems];

  $: filtered = query.trim()
    ? allItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : allItems;

  $: groupedResults = groupBySection(filtered);

  $: if (filtered.length > 0 && selectedIndex >= filtered.length) {
    selectedIndex = 0;
  }

  function groupBySection(items) {
    const map = new Map();
    for (const item of items) {
      const section = item.section || 'Results';
      if (!map.has(section)) map.set(section, []);
      map.get(section).push(item);
    }
    return Array.from(map.entries());
  }

  $: if (open) {
    query = '';
    selectedIndex = 0;
    error = '';
    busy = false;
    tick().then(() => inputEl?.focus());
  }

  function close() {
    open = false;
    onClose();
  }

  async function executeItem(item) {
    if (busy) return;

    if (item.id === 'toggle-theme') {
      shellStore.toggleTheme();
      toastStore.info(isDark ? 'Switched to light mode' : 'Switched to dark mode');
      close();
      return;
    }

    if (item.id === 'new-chat') {
      chatStore.newSession();
      chatStore.setChatTarget('agent');
      close();
      goto('/?mode=agent');
      toastStore.success('New chat started');
      return;
    }

    if (item.id === 'new-orchestration') {
      busy = true;
      error = '';
      try {
        const ts = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const response = await postJson('/api/orchestrations', { name: `Orchestration ${ts}` });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || 'Failed');
        const id = payload?.id || payload?.orchestrationId;
        invalidateCache('/api/orchestrations');
        close();
        toastStore.success('Orchestration created');
        if (id) goto(`/orchestrate/${id}`);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      } finally {
        busy = false;
      }
      return;
    }

    if (item.id === 'new-agent') {
      busy = true;
      error = '';
      try {
        const response = await postJson('/api/agents', { name: 'New Agent' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || 'Failed');
        const id = payload?.id || payload?.agentId;
        invalidateCache('/api/agents');
        close();
        toastStore.success('Agent created');
        if (id) goto(`/agents/${encodeURIComponent(id)}`);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      } finally {
        busy = false;
      }
      return;
    }

    if (item.sessionId) {
      await chatStore.selectSession(item.sessionId);
      close();
      goto('/?mode=agent');
      return;
    }

    if (item.agentId) {
      await chatStore.selectAgent(item.agentId);
      close();
      goto('/?mode=agent');
      return;
    }

    if (item.href) {
      close();
      goto(item.href);
      return;
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectedIndex = (selectedIndex + 1) % filtered.length;
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (filtered[selectedIndex]) executeItem(filtered[selectedIndex]);
      return;
    }
  }
</script>

{#if open}
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Command palette"
    on:click={(e) => { if (e.target === e.currentTarget) close(); }}
    on:keydown={(e) => { if (e.key === 'Escape') close(); }}
    tabindex="-1"
  >
    <div class="palette card">
      <div class="input-row">
        <Icon name="search" size={18} />
        <input
          bind:this={inputEl}
          bind:value={query}
          on:keydown={onKeyDown}
          placeholder="Search or type a command..."
          spellcheck="false"
          autocomplete="off"
        />
        <kbd class="shortcut">esc</kbd>
      </div>

      {#if error}
        <div class="palette-error">
          <Icon name="alert" size={14} />
          <span>{error}</span>
        </div>
      {/if}

      <div class="results">
        {#if filtered.length === 0}
          <p class="no-results">No results for "{query}"</p>
        {:else}
          {#each groupedResults as [section, items]}
            <div class="section">
              <p class="section-label">{section}</p>
              {#each items as item, i}
                {@const flatIndex = filtered.indexOf(item)}
                <button
                  class="result-item"
                  class:selected={flatIndex === selectedIndex}
                  on:click={() => executeItem(item)}
                  on:mouseenter={() => { selectedIndex = flatIndex; }}
                  disabled={busy}
                >
                  <Icon name={item.icon} size={16} />
                  <span class="result-label">{item.label}</span>
                  {#if item.section === 'Actions'}
                    <kbd class="result-hint">create</kbd>
                  {:else if item.href}
                    <kbd class="result-hint">go</kbd>
                  {:else}
                    <kbd class="result-hint">open</kbd>
                  {/if}
                </button>
              {/each}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: var(--overlay-bg);
    backdrop-filter: blur(4px);
    display: flex;
    justify-content: center;
    padding-top: min(20vh, 120px);
  }

  .palette {
    width: min(560px, calc(100vw - 32px));
    max-height: min(480px, 70vh);
    display: flex;
    flex-direction: column;
    align-self: flex-start;
    border-radius: 16px;
    box-shadow: var(--shadow-strong);
    overflow: hidden;
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    color: var(--muted);
  }

  .input-row input {
    flex: 1;
    border: 0;
    background: transparent;
    outline: none;
    color: var(--fg);
    font-size: 15px;
  }

  .shortcut {
    padding: 2px 6px;
    border-radius: 5px;
    border: 1px solid var(--border);
    background: var(--bg-soft);
    color: var(--muted);
    font-size: 10px;
    font-family: var(--font-mono, monospace);
  }

  .palette-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    color: var(--danger);
    font-size: 12px;
    border-bottom: 1px solid var(--border);
  }

  .results {
    overflow: auto;
    padding: 8px;
  }

  .section {
    margin-bottom: 4px;
  }

  .section-label {
    margin: 0;
    padding: 6px 8px 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }

  .result-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--fg);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .result-item:hover,
  .result-item.selected {
    background: var(--accent-soft);
  }

  .result-item.selected {
    outline: 1px solid rgba(232, 116, 12, 0.3);
  }

  .result-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-hint {
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg-soft);
    color: var(--muted);
    font-size: 9px;
    font-family: var(--font-mono, monospace);
  }

  .no-results {
    margin: 0;
    padding: 16px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
  }
</style>
