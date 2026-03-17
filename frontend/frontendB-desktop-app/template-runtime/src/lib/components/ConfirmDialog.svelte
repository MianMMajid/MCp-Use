<script>
  import Icon from '@/lib/components/icons/Icon.svelte';

  export let open = false;
  export let title = 'Are you sure?';
  export let message = 'This action cannot be undone.';
  export let confirmLabel = 'Confirm';
  export let cancelLabel = 'Cancel';
  export let danger = false;
  export let onConfirm = () => {};
  export let onCancel = () => {};

  function confirm() {
    onConfirm();
    open = false;
  }

  function cancel() {
    onCancel();
    open = false;
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') cancel();
    if (event.key === 'Enter') confirm();
  }
</script>

{#if open}
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    on:click={(e) => { if (e.target === e.currentTarget) cancel(); }}
    on:keydown={onKeyDown}
  >
    <div class="dialog card">
      <div class="dialog-header">
        <span class="dialog-icon" class:danger>
          <Icon name={danger ? 'alert' : 'spark'} size={18} />
        </span>
        <h3>{title}</h3>
      </div>
      <p class="dialog-msg">{message}</p>
      <div class="dialog-actions">
        <button class="pill btn-cancel" on:click={cancel}>{cancelLabel}</button>
        <button class="pill btn-confirm" class:danger on:click={confirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: var(--overlay-bg);
    backdrop-filter: blur(4px);
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 16px;
  }

  .dialog {
    width: min(420px, 100%);
    padding: 20px;
    display: grid;
    gap: 12px;
    border-radius: 16px;
    box-shadow: var(--shadow-strong);
    animation: dialog-in 0.2s ease-out both;
  }

  @keyframes dialog-in {
    from { opacity: 0; transform: scale(0.96) translateY(8px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  .dialog-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .dialog-icon {
    width: 32px;
    height: 32px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: var(--info-soft);
    color: var(--info);
    flex-shrink: 0;
  }

  .dialog-icon.danger {
    background: var(--danger-soft);
    color: var(--danger);
  }

  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  .dialog-msg {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.45;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .btn-cancel {
    padding: 8px 14px;
    border-color: var(--border);
    background: var(--btn-secondary-bg);
    cursor: pointer;
    font-size: 13px;
  }

  .btn-confirm {
    padding: 8px 14px;
    border-color: var(--info-border);
    background: var(--info-soft);
    color: var(--info);
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
  }

  .btn-confirm.danger {
    border-color: var(--danger-border);
    background: var(--danger-soft);
    color: var(--danger);
  }

  @media (prefers-reduced-motion: reduce) {
    .dialog { animation: none; }
  }
</style>
