<script>
  import { toastStore } from '@/lib/stores/toast-store';
  import Icon from '@/lib/components/icons/Icon.svelte';

  const iconMap = { success: 'check', error: 'alert', warning: 'alert', info: 'spark' };
</script>

<div class="toast-container" aria-live="polite" aria-relevant="additions">
  {#each $toastStore as toast (toast.id)}
    <div class="toast {toast.type}" class:dismissing={toast.dismissing} role="status">
      <span class="toast-icon"><Icon name={iconMap[toast.type] || 'spark'} size={15} /></span>
      <span class="toast-msg">{toast.message}</span>
      <button class="toast-close" aria-label="Dismiss" on:click={() => toastStore.dismiss(toast.id)}>
        <Icon name="close" size={12} />
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 200;
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    pointer-events: none;
    max-width: min(380px, calc(100vw - 32px));
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--panel);
    backdrop-filter: blur(12px);
    box-shadow: var(--shadow-soft);
    color: var(--fg);
    font-size: 13px;
    pointer-events: auto;
    animation: toast-in 0.25s ease-out both;
  }

  .toast.dismissing {
    animation: toast-out 0.25s ease-in both;
  }

  .toast.success { border-color: var(--ok-border); }
  .toast.success .toast-icon { color: var(--ok); }
  .toast.error { border-color: var(--danger-border); }
  .toast.error .toast-icon { color: var(--danger); }
  .toast.warning { border-color: var(--caution-border); }
  .toast.warning .toast-icon { color: var(--caution); }
  .toast.info { border-color: var(--info-border); }
  .toast.info .toast-icon { color: var(--info); }

  .toast-icon { flex-shrink: 0; }
  .toast-msg { flex: 1; line-height: 1.35; }

  .toast-close {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 0;
  }

  .toast-close:hover {
    color: var(--fg);
    background: var(--accent-soft);
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(8px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes toast-out {
    from { opacity: 1; transform: translateY(0) scale(1); }
    to { opacity: 0; transform: translateY(8px) scale(0.96); }
  }

  @media (prefers-reduced-motion: reduce) {
    .toast, .toast.dismissing {
      animation: none;
    }
  }
</style>
