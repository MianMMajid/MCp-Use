<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  // Redirect to unified settings page
  onMount(() => goto('/profile?tab=account', { replaceState: true }));
</script>

<p>Redirecting to settings...</p>
