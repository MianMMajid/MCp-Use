<script>
  import '../styles/mayple-a1-parity.css'
  import '../styles/theme-dark.css'
  import { onMount } from 'svelte'
  import { initTheme } from '../lib/maple-workspace/theme-store.js'

  onMount(() => {
    initTheme()
  })
</script>

<slot />
