<script>
  import { onMount } from 'svelte';
  import '../app.css';
  import { initializeFakeModeRuntime } from '@/lib/fake-mode/runtime';
  import { chatStore } from '@/lib/stores/chat-store';
  import { shellStore } from '@/lib/stores/shell-store';
  import FakeModeControl from '@/lib/components/FakeModeControl.svelte';

  onMount(async () => {
    initializeFakeModeRuntime();
    shellStore.hydrate();
    await chatStore.initialize();
  });
</script>

<svelte:head>
  <link rel="icon" href="/maple-favicon.svg" />
  <title>Mayple</title>
</svelte:head>

<slot />
<FakeModeControl />
