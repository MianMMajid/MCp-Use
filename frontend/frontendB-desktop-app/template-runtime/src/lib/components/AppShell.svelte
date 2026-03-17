<script>
  import BottomNav from '@/lib/components/BottomNav.svelte';
  import ToastContainer from '@/lib/components/ToastContainer.svelte';
</script>

<div class="shell">
  <main class="main"><slot /></main>
  <BottomNav />
  <ToastContainer />
</div>

<style>
  .shell {
    min-height: 100svh;
    display: flex;
    flex-direction: column;
  }

  .main {
    flex: 1;
    min-height: 0;
    padding: 12px;
    /* Extra bottom padding for floating dock — safe for all positions
       since dock at top/left/right only needs 44px + 12px margin */
    padding-bottom: 68px;
  }
</style>
