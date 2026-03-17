<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  onMount(() => goto('/profile?tab=account', { replaceState: true }));
</script>
<p>Redirecting...</p>
