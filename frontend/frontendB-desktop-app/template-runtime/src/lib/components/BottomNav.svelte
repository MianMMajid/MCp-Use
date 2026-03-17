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
  let dragStarted = false;  // true once threshold exceeded
  let dragStartX = 0;
  let dragStartY = 0;
  let dragX = 0;
  let dragY = 0;
  let snapPreview = '';  // edge the dock will snap to during drag
  let dockEl;
  let trackEl;
  let pillEls = [];
  let indicatorEl;

  const DRAG_THRESHOLD = 8; // px before drag actually begins

  $: isVertical = dockPosition === 'left' || dockPosition === 'right';

  // Measure active pill and position indicator precisely
  $: if (activeIndex >= 0 && trackEl && pillEls[activeIndex] && indicatorEl) {
    tick().then(updateIndicator);
  }

  function updateIndicator() {
    if (!indicatorEl || activeIndex < 0 || !trackEl || !pillEls[activeIndex]) {
      if (indicatorEl) indicatorEl.style.opacity = '0';
      return;
    }
    const track = trackEl.getBoundingClientRect();
    const pill = pillEls[activeIndex].getBoundingClientRect();
    const el = indicatorEl;
    if (isVertical) {
      el.style.top = `${pill.top - track.top}px`;
      el.style.left = '4px';
      el.style.width = `calc(100% - 8px)`;
      el.style.height = `${pill.height}px`;
    } else {
      el.style.left = `${pill.left - track.left}px`;
      el.style.top = '3px';
      el.style.width = `${pill.width}px`;
      el.style.height = `calc(100% - 6px)`;
    }
    el.style.opacity = '1';
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

  // ── Drag helpers ──
  function getEdgeForPosition(x, y) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const distTop = y;
    const distBottom = vh - y;
    const distLeft = x;
    const distRight = vw - x;
    const min = Math.min(distTop, distBottom, distLeft, distRight);
    if (min === distTop) return 'top';
    if (min === distBottom) return 'bottom';
    if (min === distLeft) return 'left';
    return 'right';
  }

  function getSnapTarget(edge) {
    // Returns the CSS position the dock would snap to for a given edge
    const m = 24;
    switch (edge) {
      case 'top':    return { left: '50%', top: `${m}px`, right: 'auto', bottom: 'auto', transform: 'translateX(-50%)' };
      case 'bottom': return { left: '50%', top: 'auto', right: 'auto', bottom: `${m}px`, transform: 'translateX(-50%)' };
      case 'left':   return { left: `${m}px`, top: '50%', right: 'auto', bottom: 'auto', transform: 'translateY(-50%)' };
      case 'right':  return { left: 'auto', top: '50%', right: `${m}px`, bottom: 'auto', transform: 'translateY(-50%)' };
    }
  }

  // ── Drag handlers ──
  function onGripDown(event) {
    if (commandPaletteOpen) return;
    // Don't call preventDefault on touchstart (passive listener)
    if (!event.touches) event.preventDefault();

    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    dragStartX = clientX;
    dragStartY = clientY;
    dragX = clientX;
    dragY = clientY;
    dragging = true;
    dragStarted = false;
    snapPreview = '';

    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

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

    // Check drag threshold before starting visual drag
    if (!dragStarted) {
      const dx = clientX - dragStartX;
      const dy = clientY - dragStartY;
      if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
      dragStarted = true;
    }

    // Update snap preview
    snapPreview = getEdgeForPosition(clientX, clientY);

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

    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
    window.removeEventListener('touchmove', onDragMove);
    window.removeEventListener('touchend', onDragEnd);

    // Re-enable text selection
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';

    // If threshold was never exceeded, treat as a click — no position change
    if (!dragStarted) {
      dragging = false;
      snapPreview = '';
      return;
    }

    // Animate to snap position instead of jumping
    const newPosition = getEdgeForPosition(dragX, dragY);
    const target = getSnapTarget(newPosition);

    if (dockEl) {
      // Apply snap target with smooth transition
      dockEl.style.transition = 'left 0.35s cubic-bezier(0.2, 0.9, 0.3, 1), top 0.35s cubic-bezier(0.2, 0.9, 0.3, 1), right 0.35s cubic-bezier(0.2, 0.9, 0.3, 1), bottom 0.35s cubic-bezier(0.2, 0.9, 0.3, 1), transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1)';
      dockEl.style.left = target.left;
      dockEl.style.top = target.top;
      dockEl.style.right = target.right;
      dockEl.style.bottom = target.bottom;
      dockEl.style.transform = target.transform;

      // After animation, clear inline styles and let CSS class take over
      setTimeout(() => {
        if (dockEl) {
          dockEl.style.position = '';
          dockEl.style.left = '';
          dockEl.style.top = '';
          dockEl.style.right = '';
          dockEl.style.bottom = '';
          dockEl.style.transform = '';
          dockEl.style.transition = '';
        }
      }, 380);
    }

    dockPosition = newPosition;
    dragging = false;
    snapPreview = '';

    // Persist
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DOCK_POS_KEY, dockPosition);
    }

    // Re-measure indicator after orientation may have changed
    tick().then(() => setTimeout(updateIndicator, 400));
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

      <div class="nav-indicator" bind:this={indicatorEl}></div>

      {#each navItems as item, i}
        <button
          class="nav-pill"
          class:active={i === activeIndex}
          bind:this={pillEls[i]}
          on:click={() => goto(item.href)}
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

{#if dragStarted}
  <div class="snap-zone snap-zone-{snapPreview}"></div>
{/if}

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

  /* ── Snap zone preview ── */
  .snap-zone {
    position: fixed;
    z-index: 49;
    pointer-events: none;
    transition: opacity 0.2s;
  }

  .snap-zone-bottom {
    bottom: 0; left: 0; right: 0; height: 6px;
    background: linear-gradient(to top, var(--accent), transparent);
    opacity: 0.5;
  }

  .snap-zone-top {
    top: 0; left: 0; right: 0; height: 6px;
    background: linear-gradient(to bottom, var(--accent), transparent);
    opacity: 0.5;
  }

  .snap-zone-left {
    top: 0; bottom: 0; left: 0; width: 6px;
    background: linear-gradient(to right, var(--accent), transparent);
    opacity: 0.5;
  }

  .snap-zone-right {
    top: 0; bottom: 0; right: 0; width: 6px;
    background: linear-gradient(to left, var(--accent), transparent);
    opacity: 0.5;
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-indicator { transition: none; }
    .dock { transition: none; }
  }
</style>
