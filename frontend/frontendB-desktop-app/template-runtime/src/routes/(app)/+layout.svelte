<script>
  import { onMount } from 'svelte';
  import { chatStore } from '@/lib/stores/chat-store';
  import { shellStore } from '@/lib/stores/shell-store';

  onMount(() => {
    shellStore.hydrate();
    void chatStore.initialize();
  });
</script>

<slot />
