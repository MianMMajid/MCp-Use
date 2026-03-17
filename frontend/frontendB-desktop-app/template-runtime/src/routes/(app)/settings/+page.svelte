<script>
  import { goto } from '$app/navigation';
  import AppShell from '@/lib/components/AppShell.svelte';

  const tabs = [
    { label: 'Account', href: '/settings/account' },
    { label: 'Address', href: '/settings/address' },
    { label: 'Notifications', href: '/settings/notifications' },
    { label: 'API Keys', href: '/api-keys' },
    { label: 'Service Accounts', href: '/service-accounts' },
    { label: 'Sessions', href: '/sessions' }
  ];
</script>

<AppShell>
  <section class="page card">
    <h1>Settings</h1>
    <div class="tabs">
      {#each tabs as tab}
        <button class="pill" on:click={() => goto(tab.href)}>{tab.label}</button>
      {/each}
    </div>
  </section>
</AppShell>

<style>
  .page { min-height: calc(100svh - 24px); padding: 14px; }
  h1 { margin: 0 0 10px; }
  .tabs { display: flex; flex-wrap: wrap; gap: 8px; }
  .tabs button { padding: 8px 11px; border-color: rgba(249,115,22,.35); background: var(--btn-secondary-bg); cursor: pointer; }
</style>
