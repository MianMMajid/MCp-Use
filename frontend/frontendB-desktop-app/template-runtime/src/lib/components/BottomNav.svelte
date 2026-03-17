<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { shellStore } from '@/lib/stores/shell-store';
  import Icon from '@/lib/components/icons/Icon.svelte';
  import CommandPalette from '@/lib/components/CommandPalette.svelte';

  const DOCK_POS_KEY = 'mayple_dock_position';
  const VALID_POSITIONS = ['bottom', 'top', 'left', 'right'];

  let commandPaletteOpen = false;
  let dockPosition = 'bottom';  // bottom | top | left | right
  let dragging = false;
  let dragX = 0;
  let dragY = 0;
  let dockEl;

  $: isVertical = dockPosition === 'left' || dockPosition === 'right';

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

  // ── ⌘K global shortcut ──
  function onGlobalKeyDown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      commandPaletteOpen = !commandPaletteOpen;
    }
  }

  // ── Drag handlers ──
  function onGripDown(event) {
    if (commandPaletteOpen) return;
    event.preventDefault();
    dragging = true;

    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    dragX = clientX;
    dragY = clientY;

    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchmove', onDragMove, { passive: false });
    window.addEventListener('touchend', onDragEnd);
  }

  function onDragMove(event) {
    if (!dragging) return;
    event.preventDefault();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    dragX = clientX;
    dragY = clientY;

    // Live preview — move dock to cursor position
    if (dockEl) {
      dockEl.style.position = 'fixed';
      dockEl.style.left = `${clientX}px`;
      dockEl.style.top = `${clientY}px`;
      dockEl.style.transform = 'translate(-50%, -50%)';
      dockEl.style.right = 'auto';
      dockEl.style.bottom = 'auto';
      dockEl.style.transition = 'none';
    }
  }

  function onDragEnd() {
    if (!dragging) return;
    dragging = false;

    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
    window.removeEventListener('touchmove', onDragMove);
    window.removeEventListener('touchend', onDragEnd);

    // Snap to nearest edge
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const distTop = dragY;
    const distBottom = vh - dragY;
    const distLeft = dragX;
    const distRight = vw - dragX;
    const min = Math.min(distTop, distBottom, distLeft, distRight);

    if (min === distTop) dockPosition = 'top';
    else if (min === distBottom) dockPosition = 'bottom';
    else if (min === distLeft) dockPosition = 'left';
    else dockPosition = 'right';

    // Clear inline drag styles — let CSS class handle positioning
    if (dockEl) {
      dockEl.style.position = '';
      dockEl.style.left = '';
      dockEl.style.top = '';
      dockEl.style.right = '';
      dockEl.style.bottom = '';
      dockEl.style.transform = '';
      dockEl.style.transition = '';
    }

    // Persist
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DOCK_POS_KEY, dockPosition);
    }
  }

  // ── Lifecycle ──
  onMount(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', onGlobalKeyDown);

      // Restore saved position
      const saved = window.localStorage.getItem(DOCK_POS_KEY);
      if (saved && VALID_POSITIONS.includes(saved)) {
        dockPosition = saved;
      }
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onGlobalKeyDown);
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('touchmove', onDragMove);
      window.removeEventListener('touchend', onDragEnd);
    }
  });
</script>

<nav
  class="dock dock-{dockPosition}"
  class:vertical={isVertical}
  class:dragging
  aria-label="Main navigation"
  bind:this={dockEl}
>
  <div class="dock-inner">
    <!-- Grip handle — drag from here -->
    <button
      class="grip"
      aria-label="Drag to reposition dock"
      title="Drag to move"
      on:mousedown={onGripDown}
      on:touchstart={onGripDown}
    >
      <Icon name="grip" size={14} />
    </button>

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
          {#if !isVertical}
            <span class="nav-label">{item.label}</span>
          {/if}
        </button>
      {/each}

      <button
        class="nav-pill search-pill"
        on:click={() => { commandPaletteOpen = true; }}
        aria-label="Search and actions"
      >
        <Icon name="search" size={18} />
        {#if !isVertical}
          <span class="nav-label">Search</span>
          <kbd class="kbd">⌘K</kbd>
        {/if}
      </button>
    </div>

    <div class="nav-utils">
      <button
        class="util-btn"
        aria-label={$shellStore.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={$shellStore.theme === 'dark' ? 'Light mode' : 'Dark mode'}
        on:click={() => shellStore.toggleTheme()}
      >
        <Icon name={$shellStore.theme === 'dark' ? 'sun' : 'moon'} size={16} />
      </button>
      <button
        class="util-btn"
        aria-label="Profile"
        title="Profile & Settings"
        on:click={() => goto('/profile')}
      >
        <Icon name="agent" size={16} />
      </button>
    </div>
  </div>
</nav>

<CommandPalette bind:open={commandPaletteOpen} onClose={() => { commandPaletteOpen = false; }} />

<style>
  /* ── Dock container — positioned by class ── */
  .dock {
    position: fixed;
    z-index: 50;
    pointer-events: none;
    transition: top 0.35s cubic-bezier(0.2, 0.9, 0.3, 1),
                bottom 0.35s cubic-bezier(0.2, 0.9, 0.3, 1),
                left 0.35s cubic-bezier(0.2, 0.9, 0.3, 1),
                right 0.35s cubic-bezier(0.2, 0.9, 0.3, 1);
  }

  .dock.dragging { transition: none; }

  /* Position classes */
  .dock-bottom { bottom: 12px; left: 50%; right: auto; top: auto; transform: translateX(-50%); }
  .dock-top    { top: 12px; left: 50%; right: auto; bottom: auto; transform: translateX(-50%); }
  .dock-left   { left: 12px; top: 50%; right: auto; bottom: auto; transform: translateY(-50%); }
  .dock-right  { right: 12px; top: 50%; left: auto; bottom: auto; transform: translateY(-50%); }

  /* ── Inner layout ── */
  .dock-inner {
    display: flex;
    align-items: center;
    gap: 8px;
    pointer-events: auto;
  }

  .dock.vertical .dock-inner {
    flex-direction: column;
  }

  /* ── Grip handle ── */
  .grip {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--muted);
    cursor: grab;
    display: grid;
    place-items: center;
    padding: 0;
    flex-shrink: 0;
    transition: color 0.15s, background 0.15s;
  }

  .grip:hover {
    color: var(--accent);
    background: var(--accent-soft);
  }

  .grip:active, .dock.dragging .grip {
    cursor: grabbing;
    color: var(--accent);
  }

  /* ── Nav track ── */
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
  }

  .dock.vertical .nav-track {
    flex-direction: column;
    height: auto;
    width: 44px;
    border-radius: 22px;
  }

  /* ── Indicator ── */
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

  .dock.vertical .nav-indicator {
    width: calc(100% - 6px);
    height: calc((100% - 6px) / var(--pill-count));
    transform: translateY(calc(var(--active-index) * 100%));
  }

  /* ── Pills ── */
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

  .dock.vertical .nav-pill {
    min-width: 38px;
    width: 38px;
    height: 38px;
    padding: 0;
  }

  .nav-pill:hover { color: var(--fg); }
  .nav-pill.active { color: var(--ink); }

  .nav-label { display: inline; }

  .search-pill { gap: 5px; }

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

  /* ── Utils ── */
  .nav-utils {
    display: flex;
    gap: 6px;
  }

  .dock.vertical .nav-utils {
    flex-direction: column;
  }

  .util-btn {
    width: 36px;
    height: 36px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--glass);
    backdrop-filter: blur(12px);
    color: var(--muted);
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 0;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
    box-shadow: var(--shadow-soft);
  }

  .util-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-soft);
  }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .nav-label { display: none; }
    .kbd { display: none; }
    .nav-pill { min-width: 48px; padding: 0 10px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-indicator { transition: none; }
    .dock { transition: none; }
  }
</style>
