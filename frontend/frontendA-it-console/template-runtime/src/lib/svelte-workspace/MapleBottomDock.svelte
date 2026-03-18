<script>
  import { goto } from '$app/navigation'
  import { tick } from 'svelte'

  export let items = []
  export let activeKey = ''

  let trackEl
  let indicatorEl
  let pillEls = []

  $: activeIndex = items.findIndex((item) => item.key === activeKey)
  $: if (activeIndex >= 0 && trackEl && pillEls[activeIndex] && indicatorEl) {
    tick().then(() => requestAnimationFrame(measureAndApplyIndicator))
  }

  function measureAndApplyIndicator() {
    if (!indicatorEl || activeIndex < 0 || !trackEl || !pillEls[activeIndex]) {
      if (indicatorEl) indicatorEl.style.opacity = '0'
      return
    }
    const track = trackEl.getBoundingClientRect()
    const pill = pillEls[activeIndex].getBoundingClientRect()
    indicatorEl.style.left = `${pill.left - track.left}px`
    indicatorEl.style.top = '3px'
    indicatorEl.style.width = `${pill.width}px`
    indicatorEl.style.height = `calc(100% - 6px)`
    indicatorEl.style.opacity = '1'
  }

  async function navigate(href) {
    await goto(href)
  }
</script>

<nav class="fa-dock" aria-label="Primary navigation">
  <div class="fa-dock-track" bind:this={trackEl}>
    <div class="fa-dock-indicator" bind:this={indicatorEl}></div>
    {#each items as item, index}
      <button
        type="button"
        class="fa-dock-pill"
        class:active={item.key === activeKey}
        bind:this={pillEls[index]}
        on:click={() => navigate(item.href)}
        aria-current={item.key === activeKey ? 'page' : undefined}
      >
        <span class="fa-dock-icon" aria-hidden="true">
          {#if item.icon === 'chat'}
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 4.7a2.2 2.2 0 0 1 2.2-2.2h5.2a2.2 2.2 0 0 1 2.2 2.2v3.7a2.2 2.2 0 0 1-2.2 2.2H7.2L4 13V10.6A2.2 2.2 0 0 1 3.2 8.4z"></path></svg>
          {:else if item.icon === 'monitor'}
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="11" height="8" rx="1.6"></rect><path d="M6 13.5h4"></path><path d="M8 10.5v3"></path></svg>
          {:else if item.icon === 'firewalls'}
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.8l4.7 1.7v3.8c0 3-1.8 5.4-4.7 6.9C5.1 12.7 3.3 10.3 3.3 7.3V3.5L8 1.8z"></path><path d="M5.8 7.7l1.4 1.4 3-3"></path></svg>
          {:else if item.icon === 'agents'}
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="5" r="2.3"></circle><path d="M3.6 13c.7-2.1 2.5-3.2 4.4-3.2s3.7 1.1 4.4 3.2"></path></svg>
          {:else if item.icon === 'admin'}
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.2l1.1 1.1 1.6-.2.8 1.4 1.5.7-.2 1.6 1.1 1.2-1.1 1.2.2 1.6-1.5.7-.8 1.4-1.6-.2L8 13.8l-1.1 1.1-1.6-.2-.8-1.4-1.5-.7.2-1.6L1.9 8l1.1-1.2-.2-1.6 1.5-.7.8-1.4 1.6.2L8 2.2z"></path><circle cx="8" cy="8" r="2"></circle></svg>
          {:else}
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3.5h10v9H3z"></path><path d="M5.2 6h5.6"></path><path d="M5.2 8.3h5.6"></path><path d="M5.2 10.6h3.3"></path></svg>
          {/if}
        </span>
        <span class="fa-dock-label">{item.label}</span>
      </button>
    {/each}
  </div>
</nav>

<style>
  .fa-dock {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 70;
  }

  .fa-dock-track {
    position: relative;
    display: inline-flex;
    align-items: center;
    height: 44px;
    padding: 3px;
    background: rgba(255, 255, 255, 0.82);
    border: 1px solid var(--line-strong);
    border-radius: 22px;
    backdrop-filter: blur(16px) saturate(160%);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  }

  .fa-dock-indicator {
    position: absolute;
    border-radius: 19px;
    background: var(--brand);
    box-shadow: 0 2px 8px rgba(232, 116, 12, 0.3);
    transition: left 0.35s cubic-bezier(0.2, 0.9, 0.3, 1), width 0.35s cubic-bezier(0.2, 0.9, 0.3, 1);
    pointer-events: none;
    opacity: 0;
  }

  .fa-dock-pill {
    position: relative;
    z-index: 1;
    height: 38px;
    min-width: 86px;
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

  .fa-dock-pill:hover {
    color: var(--ink);
  }

  .fa-dock-pill.active {
    color: white;
  }

  .fa-dock-icon {
    display: inline-grid;
    place-items: center;
  }

  .fa-dock-label {
    display: inline;
  }

  @media (max-width: 900px) {
    .fa-dock {
      bottom: 16px;
      width: calc(100vw - 24px);
      max-width: 100%;
    }

    .fa-dock-track {
      width: 100%;
      justify-content: space-between;
    }

    .fa-dock-pill {
      min-width: 0;
      flex: 1 1 0;
      padding: 0 10px;
    }

    .fa-dock-label {
      display: none;
    }
  }
</style>
