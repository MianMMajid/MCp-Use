<script>
  import { onMount } from 'svelte'
  import {
    CHANGE_EVENT,
    disableFakeMode,
    enableFakeMode,
    isFakeModeEnabled,
    regenerateFakeData,
  } from '../fake-mode/runtime.js'

  let enabled = false
  let busy = false
  let seeded = false

  function refresh() {
    enabled = isFakeModeEnabled()
  }

  async function generateFakeData() {
    if (busy) return
    busy = true
    try {
      if (!enabled) {
        enableFakeMode()
      }
      regenerateFakeData()
      seeded = true
    } finally {
      refresh()
      busy = false
    }
  }

  function useRealApi() {
    disableFakeMode()
    seeded = false
    refresh()
  }

  onMount(() => {
    refresh()
    const handler = () => refresh()
    window.addEventListener(CHANGE_EVENT, handler)
    return () => window.removeEventListener(CHANGE_EVENT, handler)
  })
</script>

<div class="fake-data-fab" aria-live="polite">
  <span class="fake-status" class:is-on={enabled}>{enabled ? 'FAKE ON' : 'FAKE OFF'}</span>
  <button type="button" class="fake-btn fake-btn-primary" disabled={busy} on:click={generateFakeData}>
    {busy ? 'Seeding...' : 'Generate Fake Data'}
  </button>
  {#if enabled}
    <button type="button" class="fake-btn" on:click={useRealApi}>Use Real API</button>
  {/if}
  {#if seeded}
    <span class="seeded-note">Interactive demo data loaded.</span>
  {/if}
</div>

<style>
  .fake-data-fab {
    position: fixed;
    right: 14px;
    bottom: 14px;
    z-index: 120;
    display: grid;
    grid-auto-flow: row;
    gap: 0.35rem;
    justify-items: end;
    padding: 0.5rem;
    border: 1px solid rgba(229, 221, 212, 0.95);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
    backdrop-filter: blur(8px);
  }

  .fake-status {
    border: 1px solid #d7c9bc;
    border-radius: 999px;
    padding: 0.15rem 0.48rem;
    font-size: 0.66rem;
    font-weight: 700;
    color: #706256;
    background: #faf6f1;
  }

  .fake-status.is-on {
    color: #8f4d1b;
    border-color: rgba(232, 116, 12, 0.4);
    background: rgba(232, 116, 12, 0.12);
  }

  .fake-btn {
    border: 1px solid #d1c5b8;
    border-radius: 999px;
    min-height: 30px;
    padding: 0.32rem 0.7rem;
    font-size: 0.73rem;
    font-weight: 600;
    color: #4a3c30;
    background: #fff;
    cursor: pointer;
  }

  .fake-btn:hover {
    border-color: #c55d00;
  }

  .fake-btn:disabled {
    opacity: 0.62;
    cursor: not-allowed;
  }

  .fake-btn-primary {
    color: #fff;
    border-color: #c55d00;
    background: linear-gradient(145deg, #e8740c, #c55d00);
  }

  .seeded-note {
    font-size: 0.66rem;
    color: #6d5d4f;
  }
  @media (max-width: 780px) {
    .fake-data-fab {
      right: 10px;
      bottom: 10px;
    }
  }
</style>
