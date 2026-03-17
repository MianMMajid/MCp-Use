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
  let trackEl;
  let pillEls = [];
  let indicatorStyle = '';

  $: isVertical = dockPosition === 'left' || dockPosition === 'right';

  // Measure active pill and position indicator precisely
  $: if (activeIndex >= 0 && trackEl && pillEls[activeIndex]) {
    tick().then(updateIndicator);
  }

  function updateIndicator() {
    if (activeIndex < 0 || !trackEl || !pillEls[activeIndex]) {
      indicatorStyle = 'opacity: 0';
      return;
    }
    const track = trackEl.getBoundingClientRect();
    const pill = pillEls[activeIndex].getBoundingClientRect();
    if (isVertical) {
      const top = pill.top - track.top;
      indicatorStyle = `top: ${top}px; left: 4px; width: calc(100% - 8px); height: ${pill.height}px; opacity: 1`;
    } else {
      const left = pill.left - track.left;
      indicatorStyle = `left: ${left}px; top: 3px; width: ${pill.width}px; height: calc(100% - 6px); opacity: 1`;
    }
  }

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

      // Initial indicator measurement after DOM settles
      tick().then(() => {
        setTimeout(updateIndicator, 50);
      });
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
    <div class="nav-track" bind:this={trackEl}>
      <!-- Grip handle -->
      <span
        class="grip"
        role="button"
        tabindex="0"
        aria-label="Drag to reposition dock"
        title="Drag to move"
        on:mousedown={onGripDown}
        on:touchstart={onGripDown}
      >
        <Icon name="grip" size={16} />
      </span>

      <div class="nav-indicator" style={indicatorStyle}></div>

      {#each navItems as item, i}
        <button
          class="nav-pill"
          class:active={i === activeIndex}
          bind:this={pillEls[i]}
          on:click={() => { goto(item.href); tick().then(updateIndicator); }}
          aria-label={item.label}
          aria-current={i === activeIndex ? 'page' : undefined}
        >
          <Icon name={item.icon} size={16} />
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
        <Icon name="search" size={16} />
        {#if !isVertical}
          <span class="nav-label">Search</span>
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

  /* Position classes — decent margin from edges */
  .dock-bottom { bottom: 24px; left: 50%; right: auto; top: auto; transform: translateX(-50%); }
  .dock-top    { top: 24px; left: 50%; right: auto; bottom: auto; transform: translateX(-50%); }
  .dock-left   { left: 24px; top: 50%; right: auto; bottom: auto; transform: translateY(-50%); }
  .dock-right  { right: 24px; top: 50%; left: auto; bottom: auto; transform: translateY(-50%); }

  /* ── Inner layout ── */
  .dock-inner {
    display: flex;
    align-items: center;
    gap: 0;
    pointer-events: auto;
  }

  .dock.vertical .dock-inner {
    flex-direction: column;
  }

  /* ── Grip handle — clearly visible drag target ── */
  .grip {
    position: relative;
    z-index: 1;
    width: 24px;
    height: 38px;
    border: 0;
    border-radius: 8px;
    background: var(--accent-soft);
    color: var(--accent);
    cursor: grab;
    display: grid;
    place-items: center;
    padding: 0;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
  }

  .grip:hover {
    background: rgba(232, 116, 12, 0.2);
    color: var(--accent-strong);
  }

  .grip:active, .dock.dragging .grip {
    cursor: grabbing;
    background: var(--accent);
    color: #fff;
  }

  .dock.vertical .grip {
    width: 38px;
    height: 24px;
  }

  /* ── Nav track ── */
  .nav-track {
    position: relative;
    display: inline-flex;
    align-items: center;
    height: 44px;
    padding: 3px 3px 3px 2px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: 22px;
    backdrop-filter: blur(16px) saturate(160%);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  }

  .dock.vertical .nav-track {
    flex-direction: column;
    height: auto;
    width: 52px;
    border-radius: 26px;
    padding: 4px;
  }

  /* ── Indicator — solid orange pill, JS-measured to fit active pill exactly ── */
  .nav-indicator {
    position: absolute;
    border-radius: 19px;
    background: var(--accent);
    box-shadow: 0 2px 8px rgba(232, 116, 12, 0.3);
    transition: left 0.35s cubic-bezier(0.2, 0.9, 0.3, 1),
                top 0.35s cubic-bezier(0.2, 0.9, 0.3, 1),
                width 0.35s cubic-bezier(0.2, 0.9, 0.3, 1),
                height 0.35s cubic-bezier(0.2, 0.9, 0.3, 1);
    pointer-events: none;
    opacity: 0;
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
    min-width: 44px;
    width: 44px;
    height: 44px;
    padding: 0;
  }

  .nav-pill:hover { color: var(--fg); }
  .nav-pill.active { color: #fff; }

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
    margin-left: 8px;
  }

  .dock.vertical .nav-utils {
    flex-direction: column;
    margin-left: 0;
    margin-top: 8px;
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
