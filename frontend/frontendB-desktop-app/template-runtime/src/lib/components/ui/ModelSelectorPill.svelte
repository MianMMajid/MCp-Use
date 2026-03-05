<script>
  import { onMount } from 'svelte';
  import Icon from '@/lib/components/icons/Icon.svelte';

  const MODEL_STORAGE_KEY = 'mayple_dummy_model';
  const MODEL_OPTIONS = [
    { id: 'auto', title: 'Auto', subtitle: 'Decides how long to think', trigger: 'Auto' },
    { id: 'instant-53', title: 'Instant 5.3', subtitle: 'Answers right away', trigger: 'Instant' },
    { id: 'thinking-52', title: 'Thinking 5.2', subtitle: 'Thinks longer for better answers', trigger: 'Thinking' },
    { id: 'pro-52', title: 'Pro 5.2', subtitle: 'Research-grade intelligence', trigger: 'Pro' }
  ];

  let open = false;
  let model = 'thinking-52';
  let root;

  $: selected = MODEL_OPTIONS.find((item) => item.id === model) || MODEL_OPTIONS[2];

  onMount(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(MODEL_STORAGE_KEY);
      if (stored && MODEL_OPTIONS.some((item) => item.id === stored)) model = stored;
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

  function onSelect(nextModel) {
    model = nextModel;
    open = false;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MODEL_STORAGE_KEY, nextModel);
    }
  }
</script>

<div class="model-selector" bind:this={root}>
  <button class="trigger" on:click={() => (open = !open)} aria-haspopup="listbox" aria-expanded={open}>
    <span class="primary">Mayple 5.2</span>
    <span class="secondary">{selected.trigger}</span>
    <Icon name="chevron" size={14} />
  </button>

  {#if open}
    <div class="menu" role="listbox">
      <p class="menu-title">Latest</p>
      <div class="menu-items">
        {#each MODEL_OPTIONS as option}
          <button class="menu-item" on:click={() => onSelect(option.id)}>
            <div>
              <p class="item-title">{option.title}</p>
              <p class="item-subtitle">{option.subtitle}</p>
            </div>
            {#if option.id === selected.id}
              <span class="check">✓</span>
            {/if}
          </button>
        {/each}
      </div>
      <div class="divider"></div>
      <button class="legacy-row">
        <span>Legacy models</span>
        <span>›</span>
      </button>
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

  .legacy-row {
    width: 100%;
    border: 0;
    border-radius: 14px;
    background: transparent;
    color: #e4e4e7;
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    cursor: pointer;
    font-size: 16px;
  }

  .legacy-row:hover {
    background: rgba(255, 255, 255, 0.08);
  }
</style>
