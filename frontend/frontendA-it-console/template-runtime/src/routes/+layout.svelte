<script>
  import { onMount } from 'svelte'
  import { initializeFakeModeRuntime } from '../lib/fake-mode/runtime.js'
  import FakeDataControl from '../lib/svelte-workspace/FakeDataControl.svelte'
  import '../styles/mayple-a1-parity.css'

  onMount(() => {
    initializeFakeModeRuntime()
  })
</script>

<slot />
<FakeDataControl />
