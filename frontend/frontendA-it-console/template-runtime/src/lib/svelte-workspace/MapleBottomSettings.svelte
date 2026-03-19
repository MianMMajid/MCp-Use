<script>
  import { goto } from '$app/navigation'

  export let authMe = null
</script>

<button type="button" class="category-pill settings-pill" on:click={() => goto('/maple/settings')}>
  Settings
</button>

<style>
  .settings-pill { cursor: pointer; }
</style>
