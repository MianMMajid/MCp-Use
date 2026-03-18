<script>
  import { goto } from '$app/navigation'
  import { getMapleUtilityRoutes } from '../maple-workspace/route-registry.js'

  let open = false

  const utilityRoutes = getMapleUtilityRoutes()

  function toggle() {
    open = !open
  }

  async function navigate(href) {
    open = false
    await goto(href)
  }

  function closeIfBackdrop(event) {
    if (event.target === event.currentTarget) {
      open = false
    }
  }
</script>

<div class="utility-drawer">
  <button type="button" class="mw-topbar-button" on:click={toggle} aria-expanded={open} aria-label="Admin utilities">
    Utilities
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div class="utility-backdrop" on:click={closeIfBackdrop}>
      <div class="utility-panel">
        <div class="utility-head">
          <div>
            <p class="utility-kicker">Admin Utilities</p>
            <h3>Operational Surfaces</h3>
          </div>
          <button type="button" class="utility-close" on:click={() => (open = false)}>Close</button>
        </div>

        <div class="utility-list">
          {#each utilityRoutes as route}
            <button type="button" class="utility-link" on:click={() => navigate(route.path)}>
              <strong>{route.title}</strong>
              <span>{route.purpose}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .utility-drawer {
    position: relative;
  }

  .utility-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9997;
  }

  .utility-panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: min(420px, calc(100vw - 24px));
    border: 1px solid var(--line);
    border-radius: 18px;
    background: rgba(255, 252, 248, 0.98);
    backdrop-filter: blur(18px) saturate(155%);
    box-shadow: 0 18px 40px rgba(52, 31, 10, 0.14);
    padding: 14px;
    z-index: 9998;
  }

  .utility-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .utility-kicker {
    margin: 0 0 4px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    font-weight: 700;
  }

  .utility-head h3 {
    margin: 0;
    font-size: 1rem;
  }

  .utility-close {
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--panel);
    padding: 0.45rem 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }

  .utility-list {
    display: grid;
    gap: 8px;
  }

  .utility-link {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.92);
    text-align: left;
    padding: 12px 14px;
    display: grid;
    gap: 4px;
    cursor: pointer;
    transition: border-color 120ms ease, transform 120ms ease;
  }

  .utility-link:hover {
    border-color: var(--brand);
    transform: translateY(-1px);
  }

  .utility-link strong {
    font-size: 0.94rem;
  }

  .utility-link span {
    color: var(--muted);
    font-size: 0.82rem;
    line-height: 1.35;
  }
</style>
