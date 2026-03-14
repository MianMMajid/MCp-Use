<script>
  import { onMount } from 'svelte';
  import '../app.css';
  import { chatStore } from '@/lib/stores/chat-store';
  import { shellStore } from '@/lib/stores/shell-store';

  onMount(async () => {
    shellStore.hydrate();
    await chatStore.initialize();
  });
</script>

<svelte:head>
  <link rel="icon" href="/maple-favicon.svg" />
  <title>Mayple</title>
</svelte:head>

<slot />
