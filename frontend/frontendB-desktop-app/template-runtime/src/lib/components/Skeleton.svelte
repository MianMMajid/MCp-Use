<script>
  export let width = '100%';
  export let height = '14px';
  export let rounded = '6px';
  export let count = 1;
</script>

{#each Array(count) as _, i}
  <div class="skeleton" style:width style:height style:border-radius={rounded}></div>
{/each}

<style>
  .skeleton {
    background: linear-gradient(90deg, var(--bg-soft) 25%, var(--border) 50%, var(--bg-soft) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
      background: var(--bg-soft);
    }
  }
</style>
