<script>
  import { tick } from 'svelte'

  export let routes = []
  export let activePath = ''

  let trackEl
  let indicatorEl
  let tabEls = []

  $: activeIndex = routes.findIndex((route) => route.path === activePath)
  $: if (activeIndex >= 0 && trackEl && tabEls[activeIndex] && indicatorEl) {
    tick().then(() => requestAnimationFrame(measureAndApplyIndicator))
  }

  function measureAndApplyIndicator() {
    if (!indicatorEl || activeIndex < 0 || !trackEl || !tabEls[activeIndex]) {
      if (indicatorEl) indicatorEl.style.opacity = '0'
      return
    }
    const track = trackEl.getBoundingClientRect()
    const pill = tabEls[activeIndex].getBoundingClientRect()
    indicatorEl.style.left = `${pill.left - track.left}px`
    indicatorEl.style.top = '3px'
    indicatorEl.style.width = `${pill.width}px`
    indicatorEl.style.height = `calc(100% - 6px)`
    indicatorEl.style.opacity = '1'
  }
</script>

{#if routes.length > 1}
  <nav class="fa-section-bar" aria-label="Section navigation">
    <div class="fa-section-track" bind:this={trackEl}>
      <div class="fa-section-indicator" bind:this={indicatorEl}></div>
      {#each routes as route, index}
        <a
          href={route.path}
          class="fa-section-tab"
          class:is-active={route.path === activePath}
          bind:this={tabEls[index]}
          aria-current={route.path === activePath ? 'page' : undefined}
        >
          {route.tabLabel}
        </a>
      {/each}
    </div>
  </nav>
{/if}

<style>
  .fa-section-bar {
    position: fixed;
    left: 50%;
    bottom: 78px;
    transform: translateX(-50%);
    z-index: 69;
  }

  .fa-section-track {
    position: relative;
    display: inline-flex;
    align-items: center;
    display: flex;
    gap: 8px;
    overflow-x: auto;
    max-width: min(1240px, calc(100vw - 48px));
    height: 52px;
    padding: 3px;
    border: 1px solid var(--line-strong);
    border-radius: 26px;
    background: rgba(255, 255, 255, 0.86);
    backdrop-filter: blur(16px) saturate(160%);
    box-shadow: 0 6px 18px rgba(111, 81, 42, 0.1);
  }

  .fa-section-indicator {
    position: absolute;
    border-radius: 22px;
    background: linear-gradient(135deg, var(--brand) 0%, #ff9a3c 100%);
    box-shadow: 0 8px 18px rgba(232, 116, 12, 0.22);
    transition: left 0.35s cubic-bezier(0.2, 0.9, 0.3, 1), width 0.35s cubic-bezier(0.2, 0.9, 0.3, 1);
    pointer-events: none;
    opacity: 0;
  }

  .fa-section-tab {
    position: relative;
    z-index: 1;
    flex: 0 0 auto;
    min-height: 46px;
    padding: 0 22px;
    border-radius: 23px;
    color: var(--muted);
    text-decoration: none;
    font-size: 0.96rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    transition: color 160ms ease;
  }

  .fa-section-tab:hover {
    color: var(--ink);
  }

  .fa-section-tab.is-active {
    color: #fff;
  }

  @media (max-width: 900px) {
    .fa-section-bar {
      bottom: 70px;
    }

    .fa-section-track {
      width: calc(100vw - 24px);
      max-width: 100%;
      justify-content: flex-start;
      height: 48px;
    }

    .fa-section-tab {
      min-height: 42px;
      padding: 0 16px;
      font-size: 0.84rem;
    }
  }
</style>
