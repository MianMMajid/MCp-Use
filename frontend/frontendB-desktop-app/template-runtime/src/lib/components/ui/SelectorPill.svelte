<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import Icon from '@/lib/components/icons/Icon.svelte';

  const dispatch = createEventDispatcher();

  export let label = '';
  export let value = '';
  export let icon = 'spark';
  export let avatar = '';
  export let options = [];
  export let disabled = false;

  let open = false;
  let root;

  $: selected = options.find((option) => String(option.value) === String(value)) || options[0] || null;

  onMount(() => {
    function onDocumentMouseDown(event) {
      if (!open || !root) return;
      if (!root.contains(event.target)) open = false;
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

  function onSelect(next) {
    open = false;
    dispatch('change', next);
  }
</script>

<div class="selector" bind:this={root}>
  <button
    class="trigger"
    type="button"
    disabled={disabled}
    on:click={() => {
      if (disabled) return;
      open = !open;
    }}
    aria-haspopup="listbox"
    aria-expanded={open}
  >
    {#if avatar}
      <img class="avatar" src={avatar} alt={label} />
    {:else}
      <span class="icon"><Icon name={icon} size={15} /></span>
    {/if}
    <span class="primary">{label}</span>
    <span class="secondary">{selected?.label || 'Select'}</span>
    <Icon name="chevron" size={14} />
  </button>

  {#if open && !disabled}
    <div class="menu" role="listbox">
      <p class="menu-title">{label}</p>
      <div class="menu-items">
        {#each options as option}
          <button
            class="menu-item"
            type="button"
            on:click={() => onSelect(option.value)}
          >
            <div>
              <p class="item-title">{option.label}</p>
              {#if option.subtitle}
                <p class="item-subtitle">{option.subtitle}</p>
              {/if}
            </div>
            {#if String(option.value) === String(value)}
              <span class="check">✓</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .selector {
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
    max-width: 290px;
  }

  .trigger:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .avatar,
  .icon {
    width: 20px;
    height: 20px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.05);
    flex: 0 0 auto;
  }

  .avatar {
    object-fit: cover;
  }

  .primary {
    font-weight: 600;
    white-space: nowrap;
  }

  .secondary {
    color: #a1a1aa;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
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
    z-index: 35;
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
    max-height: min(360px, 65vh);
    overflow: auto;
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
    flex: 0 0 auto;
  }
</style>
