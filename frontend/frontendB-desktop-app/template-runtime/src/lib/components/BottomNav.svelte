<script>
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { shellStore } from '@/lib/stores/shell-store';
  import Icon from '@/lib/components/icons/Icon.svelte';
  import CommandPalette from '@/lib/components/CommandPalette.svelte';

  let commandPaletteOpen = false;

  const navItems = [
    { key: 'chat', label: 'Chat', icon: 'chat', href: '/' },
    { key: 'builder', label: 'Builder', icon: 'builder', href: '/orchestrate' },
    { key: 'firewalls', label: 'Firewalls', icon: 'firewall', href: '/firewalls' },
    { key: 'tasks', label: 'Tasks', icon: 'tasks', href: '/tasks' },
  ];

  $: path = $page.url.pathname;

  $: activeIndex = (() => {
    if (path === '/' || path.startsWith('/?')) return 0;
    if (path.startsWith('/orchestrate') || path.startsWith('/agents')) return 1;
    if (path.startsWith('/firewalls')) return 2;
    if (path.startsWith('/tasks')) return 3;
    return -1;
  })();

  function onGlobalKeyDown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      commandPaletteOpen = !commandPaletteOpen;
    }
  }

  onMount(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', onGlobalKeyDown);
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onGlobalKeyDown);
    }
  });
</script>

<nav class="bottom-nav" aria-label="Main navigation">
  <div class="nav-track" style:--pill-count={navItems.length + 1} style:--active-index={activeIndex}>
    {#if activeIndex >= 0}
      <div class="nav-indicator"></div>
    {/if}

    {#each navItems as item, i}
      <button
        class="nav-pill"
        class:active={i === activeIndex}
        on:click={() => goto(item.href)}
        aria-label={item.label}
        aria-current={i === activeIndex ? 'page' : undefined}
      >
        <Icon name={item.icon} size={18} />
        <span class="nav-label">{item.label}</span>
      </button>
    {/each}

    <button
      class="nav-pill search-pill"
      on:click={() => { commandPaletteOpen = true; }}
      aria-label="Search and actions"
    >
      <Icon name="search" size={18} />
      <span class="nav-label">Search</span>
      <kbd class="kbd">⌘K</kbd>
    </button>
  </div>
</nav>

<CommandPalette bind:open={commandPaletteOpen} onClose={() => { commandPaletteOpen = false; }} />

<style>
  .bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 50;
    display: flex;
    justify-content: center;
    padding: 0 16px 12px;
    pointer-events: none;
  }

  .nav-track {
    position: relative;
    display: inline-flex;
    align-items: center;
    height: 44px;
    padding: 3px;
    background: var(--glass);
    border: 1px solid var(--border);
    border-radius: 22px;
    backdrop-filter: blur(16px) saturate(160%);
    box-shadow: var(--shadow-soft);
    pointer-events: auto;
  }

  .nav-indicator {
    position: absolute;
    top: 3px;
    left: 3px;
    width: calc((100% - 6px) / var(--pill-count));
    height: calc(100% - 6px);
    border-radius: 19px;
    background: var(--panel);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    transform: translateX(calc(var(--active-index) * 100%));
    transition: transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1);
    pointer-events: none;
  }

  .nav-pill {
    position: relative;
    z-index: 1;
    height: 38px;
    min-width: 72px;
    padding: 0 14px;
    border: none;
    border-radius: 19px;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    transition: color 0.2s;
    white-space: nowrap;
  }

  .nav-pill:hover {
    color: var(--fg);
  }

  .nav-pill.active {
    color: var(--ink);
  }

  .nav-label {
    display: inline;
  }

  .search-pill {
    gap: 5px;
  }

  .kbd {
    padding: 1px 4px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg-soft);
    color: var(--muted);
    font-size: 9px;
    font-family: var(--font-mono, monospace);
    line-height: 1.3;
  }

  /* Responsive — icons only on narrow viewports */
  @media (max-width: 640px) {
    .nav-label { display: none; }
    .kbd { display: none; }
    .nav-pill { min-width: 48px; padding: 0 10px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-indicator { transition: none; }
  }
</style>
