<script>
  import { page } from '$app/stores';
  import AuthForm from '@/lib/components/AuthForm.svelte';

  $: token = $page.url.searchParams.get('token') || '';
</script>
<div class="auth-page">
  <AuthForm mode="verify" {token} />
</div>
<style>
  .auth-page { min-height: 100vh; display: grid; place-items: center; padding: 1rem; }
</style>
