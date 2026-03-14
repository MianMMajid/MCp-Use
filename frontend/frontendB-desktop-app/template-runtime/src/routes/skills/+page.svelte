<script>
  import { onMount } from 'svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { loadJson, postJson, invalidateCache } from '@/lib/api';

  let loading = true;
  let error = '';
  let search = '';
  let selectedCategory = 'all';
  let items = [];
  let smokeTests = {};

  $: categories = ['all', ...Array.from(new Set(items.map((item) => item.category || 'uncategorized')))].sort();
  $: filtered = items.filter((item) => {
    if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      String(item.name || '').toLowerCase().includes(query) ||
      String(item.description || '').toLowerCase().includes(query) ||
      String(item.toolId || '').toLowerCase().includes(query)
    );
  });

  async function refresh() {
    loading = true;
    error = '';
    try {
      const data = await loadJson('/api/skills');
      items = data?.items || [];
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  onMount(refresh);

  async function runSmokeTest(skillId) {
    smokeTests = {
      ...smokeTests,
      [skillId]: { loading: true, result: null, error: '' },
    };
    const response = await postJson(`/api/skills/${skillId}/smoke-test`, {});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      smokeTests = {
        ...smokeTests,
        [skillId]: { loading: false, result: null, error: payload?.error || `Smoke test failed (${response.status})` },
      };
      return;
    }
    smokeTests = {
      ...smokeTests,
      [skillId]: { loading: false, result: payload.result, error: '' },
    };
    invalidateCache('/api/skills');
  }
</script>

<AppShell>
  <section class="page">
    <section class="card section">
      <h1>Skills Toolbox</h1>
      <p class="muted">Backend catalog with normalized categories and non-destructive smoke tests.</p>
      <div class="filters">
        <input bind:value={search} placeholder="Search skills..." />
        <select bind:value={selectedCategory}>
          {#each categories as category}
            <option value={category}>{category}</option>
          {/each}
        </select>
      </div>
      {#if error}<p class="err">{error}</p>{/if}
    </section>

    <section class="card section">
      {#if loading}
        <p class="muted">Loading skills...</p>
      {:else if filtered.length === 0}
        <p class="muted">No skills match your filters.</p>
      {:else}
        <div class="grid">
          {#each filtered as skill}
            <article class="skill">
              <div class="skill-head">
                <div>
                  <h2>{skill.name}</h2>
                  <p class="muted mono">{skill.toolId}</p>
                </div>
                <span class="pill">{skill.category}</span>
              </div>
              <p>{skill.description}</p>
              <div class="tags">
                {#each skill.tags || [] as tag}
                  <span class="tag">{tag}</span>
                {/each}
              </div>
              <div class="row">
                <span class="muted">{skill.source} · {skill.status}</span>
                <button class="pill cta" on:click={() => runSmokeTest(skill.toolId)} disabled={smokeTests[skill.toolId]?.loading}>
                  {smokeTests[skill.toolId]?.loading ? 'Testing...' : 'Smoke Test'}
                </button>
              </div>
              {#if smokeTests[skill.toolId]?.error}
                <p class="err">{smokeTests[skill.toolId].error}</p>
              {/if}
              {#if smokeTests[skill.toolId]?.result}
                <div class="result">
                  <p class:ok={smokeTests[skill.toolId].result.passed} class:err={!smokeTests[skill.toolId].result.passed}>
                    {smokeTests[skill.toolId].result.passed ? 'PASS' : 'FAIL'} · {smokeTests[skill.toolId].result.checkedAt}
                  </p>
                  <ul>
                    {#each smokeTests[skill.toolId].result.logs || [] as line}
                      <li>{line}</li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </article>
          {/each}
        </div>
      {/if}
    </section>
  </section>
</AppShell>

<style>
  .page { min-height: calc(100svh - 24px); display: grid; gap: 12px; }
  .section { padding: 14px; }
  .filters { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .skill { border: 1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 12px; background: rgba(17,24,39,.5); display: grid; gap: 10px; }
  .skill-head, .row { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
  .tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .tag, .pill { padding: 4px 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,.14); background: rgba(20,24,32,.72); color: var(--fg); font-size: 12px; }
  .cta { border-color: rgba(249,115,22,.45); background: rgba(249,115,22,.2); cursor: pointer; }
  input, select {
    border: 1px solid rgba(255,255,255,.14); border-radius: 12px; background: rgba(20,24,32,.72); color: var(--fg); padding: 9px 11px; outline: none;
  }
  h1, h2, p, ul { margin: 0; }
  ul { padding-left: 18px; }
  .mono, .muted { color: var(--muted); }
  .ok { color: #86efac; }
  .err { color: #fecdd3; }
</style>
