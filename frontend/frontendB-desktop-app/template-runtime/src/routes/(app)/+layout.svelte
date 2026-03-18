<script>
  import { onMount, onDestroy } from 'svelte';
  import { chatStore } from '@/lib/stores/chat-store';
  import { shellStore } from '@/lib/stores/shell-store';

  onMount(() => {
    shellStore.hydrate();
    void chatStore.initialize();
  });

  onDestroy(() => {
    chatStore.destroy();
  });
</script>

<slot />
