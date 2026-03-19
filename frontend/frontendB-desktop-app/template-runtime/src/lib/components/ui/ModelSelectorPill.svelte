<script>
  import { onMount } from 'svelte';
  import Icon from '@/lib/components/icons/Icon.svelte';
  import {
    CHAT_MODEL_OPTIONS,
    CHAT_MODEL_FAMILIES,
    getChatModelOption,
    readStoredChatModelSelection,
    writeStoredChatModelSelection
  } from '@/lib/config/chat-models.js';

  let open = false;
  let openAbove = false;
  let selection = readStoredChatModelSelection(null);
  let root;

  $: selected = getChatModelOption(selection);

  $: providers = (() => {
    const map = new Map();
    for (const family of CHAT_MODEL_FAMILIES) {
      if (!map.has(family.provider)) {
        map.set(family.provider, { label: family.providerLabel, families: [] });
      }
      map.get(family.provider).families.push(family);
    }
    return [...map.entries()].map(([key, val]) => ({ key, ...val }));
  })();

  onMount(() => {
    if (typeof window !== 'undefined') {
      selection = readStoredChatModelSelection(window.localStorage);
    }

    function onDocumentMouseDown(event) {
      if (!open) return;
      if (root && !root.contains(event.target)) open = false;
    }

    function onDocumentKeyDown(event) {
      if (event.key === 'Escape') open = false;
    }

    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  });

  function onSelect(option) {
    selection = { modelId: option.modelId, reasoningEffort: option.reasoningEffort, provider: option.provider };
    open = false;
    if (typeof window !== 'undefined') {
      writeStoredChatModelSelection(window.localStorage, selection);
    }
  }
</script>

<div class="model-selector" bind:this={root}>
  <button class="trigger" on:click={() => {
    if (!open && root) {
      const rect = root.getBoundingClientRect();
      openAbove = rect.bottom + 300 > window.innerHeight;
    }
    open = !open;
  }} aria-haspopup="listbox" aria-expanded={open}>
    <span class="primary">{selected.modelTitle}</span>
    <span class="secondary">{selected.reasoningTitle}</span>
    <Icon name="chevron" size={14} />
  </button>

  {#if open}
    <div class="menu" class:above={openAbove} role="listbox">
      {#each providers as providerGroup, providerIndex}
        <p class="provider-title">{providerGroup.label}</p>
        {#each providerGroup.families as family}
          <p class="menu-title">{family.title}</p>
          <div class="menu-items">
            {#each CHAT_MODEL_OPTIONS.filter((option) => option.modelId === family.modelId && option.provider === family.provider) as option}
              <button class="menu-item" on:click={() => onSelect(option)}>
                <div>
                  <p class="item-title">{option.reasoningTitle}</p>
                  <p class="item-subtitle">{option.subtitle}</p>
                </div>
                {#if option.id === selected.id}
                  <span class="check">✓</span>
                {/if}
              </button>
            {/each}
          </div>
        {/each}
        {#if providerIndex < providers.length - 1}
          <div class="divider"></div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .model-selector {
    position: relative;
  }

  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--glass);
    color: var(--ink);
    padding: 9px 12px;
    font-size: 14px;
    cursor: pointer;
    backdrop-filter: blur(12px);
  }

  .primary {
    font-weight: 600;
  }

  .secondary {
    color: var(--muted);
  }

  .menu {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    width: 318px;
    max-height: min(400px, 60vh);
    overflow-y: auto;
    border-radius: 16px;
    border: 1px solid var(--border-strong);
    background: var(--panel);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04);
    padding: 8px;
    z-index: 40;
    backdrop-filter: blur(20px);
  }

  .menu.above {
    top: auto;
    bottom: calc(100% + 8px);
  }

  .provider-title {
    margin: 0;
    padding: 8px 10px 2px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .menu-title {
    margin: 0;
    padding: 6px 10px;
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
  }

  .menu-items {
    display: grid;
    gap: 2px;
  }

  .menu-item {
    width: 100%;
    border: 0;
    border-radius: 14px;
    background: transparent;
    color: var(--ink);
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    cursor: pointer;
  }

  .menu-item:hover {
    background: rgba(232, 116, 12, 0.08);
  }

  .item-title {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
  }

  .item-subtitle {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: 13px;
  }

  .check {
    font-size: 18px;
    color: #fafafa;
  }

  .divider {
    height: 1px;
    background: var(--accent-soft);
    margin: 8px 2px;
  }

</style>
