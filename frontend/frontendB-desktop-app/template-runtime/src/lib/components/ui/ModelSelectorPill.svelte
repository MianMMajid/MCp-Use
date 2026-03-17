<script>
  import { onMount } from 'svelte';
  import Icon from '@/lib/components/icons/Icon.svelte';
  import {
    CHAT_MODEL_OPTIONS,
    OPENAI_CHAT_MODEL_FAMILIES,
    getChatModelOption,
    readStoredChatModelSelection,
    writeStoredChatModelSelection
  } from '@/lib/config/openai-chat-models.js';

  let open = false;
  let selection = readStoredChatModelSelection(null);
  let root;

  $: selected = getChatModelOption(selection);

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
    selection = { modelId: option.modelId, reasoningEffort: option.reasoningEffort };
    open = false;
    if (typeof window !== 'undefined') {
      writeStoredChatModelSelection(window.localStorage, selection);
    }
  }
</script>

<div class="model-selector" bind:this={root}>
  <button class="trigger" on:click={() => (open = !open)} aria-haspopup="listbox" aria-expanded={open}>
    <span class="primary">{selected.modelTitle}</span>
    <span class="secondary">{selected.reasoningTitle}</span>
    <Icon name="chevron" size={14} />
  </button>

  {#if open}
    <div class="menu" role="listbox">
      {#each OPENAI_CHAT_MODEL_FAMILIES as family, familyIndex}
        <p class="menu-title">{family.title}</p>
        <div class="menu-items">
          {#each CHAT_MODEL_OPTIONS.filter((option) => option.modelId === family.modelId) as option}
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
        {#if familyIndex < OPENAI_CHAT_MODEL_FAMILIES.length - 1}
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
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(24, 27, 35, 0.94);
    color: #f4f4f5;
    padding: 9px 12px;
    font-size: 14px;
    cursor: pointer;
    backdrop-filter: blur(12px);
  }

  .primary {
    font-weight: 600;
  }

  .secondary {
    color: #a1a1aa;
  }

  .menu {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    width: 318px;
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(49, 49, 52, 0.96);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
    padding: 10px;
    z-index: 30;
    backdrop-filter: blur(16px);
  }

  .menu-title {
    margin: 0;
    padding: 6px 10px;
    color: #a1a1aa;
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
    color: #f4f4f5;
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    cursor: pointer;
  }

  .menu-item:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .item-title {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
  }

  .item-subtitle {
    margin: 2px 0 0;
    color: #a1a1aa;
    font-size: 13px;
  }

  .check {
    font-size: 18px;
    color: #fafafa;
  }

  .divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.16);
    margin: 8px 2px;
  }

</style>
