<script>
  import { onMount } from 'svelte';
  import {
    CHANGE_EVENT,
    enableFakeMode,
    disableFakeMode,
    regenerateFakeData,
    isFakeModeEnabled,
  } from '@/lib/fake-mode/runtime';

  let enabled = false;

  function refresh() {
    enabled = isFakeModeEnabled();
  }

  onMount(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  });
</script>

<div class="fake-control card">
  <span class:status-on={enabled} class="status">{enabled ? 'ON' : 'OFF'}</span>
  {#if enabled}
    <button class="pill action" on:click={() => regenerateFakeData()}>Regenerate</button>
    <button class="pill action" on:click={() => disableFakeMode()}>Use Real API</button>
  {:else}
    <button class="pill action" on:click={() => enableFakeMode()}>Enable Fake Data</button>
  {/if}
</div>

<style>
  .fake-control {
    position: fixed;
    bottom: 14px;
    right: 14px;
    z-index: 70;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
  }
  .status {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px 8px;
  }
  .status-on {
    color: #f97316;
    border-color: rgba(249, 115, 22, 0.45);
    background: rgba(249, 115, 22, 0.12);
  }
  .action {
    padding: 7px 10px;
    font-size: 12px;
    cursor: pointer;
  }
</style>
