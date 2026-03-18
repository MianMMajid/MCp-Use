<script>
  import AuthForm from '@/lib/components/AuthForm.svelte';
</script>
<div class="auth-page">
  <AuthForm mode="register" />
</div>
<style>
  .auth-page { min-height: 100vh; display: grid; place-items: center; padding: 1rem; }
</style>
