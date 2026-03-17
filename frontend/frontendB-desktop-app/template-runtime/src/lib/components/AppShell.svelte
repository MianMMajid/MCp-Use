<script>
  import MainSidebar from '@/lib/components/MainSidebar.svelte';
  import ToastContainer from '@/lib/components/ToastContainer.svelte';
  import { shellStore } from '@/lib/stores/shell-store';

  function beginResize(event) {
    if (typeof window === 'undefined') return;
    const startX = event.clientX;
    const startWidth = $shellStore.sidebarWidth;

    function onMouseMove(moveEvent) {
      const delta = moveEvent.clientX - startX;
      shellStore.setSidebarWidth(startWidth + delta);
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
</script>

<div class="shell">
  <div class="sidebar-wrap" class:collapsed={$shellStore.sidebarCollapsed}>
    <MainSidebar />
    {#if !$shellStore.sidebarCollapsed}
      <div class="resizer" on:mousedown={beginResize} aria-hidden="true"></div>
    {/if}
  </div>
  <main class="main"><slot /></main>
  <ToastContainer />
</div>

<style>
  .shell {
    display: flex;
    min-height: 100svh;
    gap: 12px;
    padding: 12px;
  }
  .sidebar-wrap {
    position: relative;
    display: flex;
    align-items: stretch;
  }
  .sidebar-wrap.collapsed .resizer {
    display: none;
  }
  .resizer {
    position: absolute;
    top: 0;
    right: -8px;
    width: 10px;
    height: 100%;
    cursor: col-resize;
    border-radius: 999px;
  }
  .resizer:hover {
    background: var(--accent-soft);
  }
  .main {
    flex: 1;
    min-width: 0;
    padding: 0;
  }
</style>
