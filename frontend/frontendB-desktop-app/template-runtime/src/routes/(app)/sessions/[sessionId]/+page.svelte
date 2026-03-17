<script>
  import { onMount } from 'svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { loadJson } from '@/lib/api';
  export let data;

  let loading = true;
  let error = '';
  let session = null;
  let runs = [];
  let _loadedSessionId = '';

  async function loadSession() {
    if (_loadedSessionId === data.sessionId && session) return;
    _loadedSessionId = data.sessionId;
    loading = true;
    error = '';
    try {
      const payload = await loadJson(`/api/openclaw/agent/sessions/${data.sessionId}`);
      session = payload?.session ?? payload ?? null;
      runs = Array.isArray(session?.runs) ? session.runs : [];
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  onMount(loadSession);
  // Re-fetch when route param changes
  $: data.sessionId, loadSession();
</script>

<AppShell>
  <section class="page card">
    <h1>Session {data.sessionId}</h1>

    {#if loading}
      <p class="muted">Loading session...</p>
    {:else if error}
      <p class="err">{error}</p>
    {:else}
      <p class="muted">Runs in this session: {runs.length}</p>
      <ul>
        {#each runs as run}
          <li>{run.runId || run.id} · {run.status || 'unknown'}</li>
        {/each}
      </ul>
    {/if}
  </section>
</AppShell>

<style>
  .page { min-height: calc(100svh - 24px); padding: 14px; }
  h1 { margin: 0 0 10px; }
  .muted { color: var(--muted); }
  .err { color: var(--warn); }
  ul { margin: 8px 0 0; padding-left: 18px; }
  li { margin: 4px 0; font-size: 13px; }
</style>
