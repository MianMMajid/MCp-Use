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
  let governedRuns = {};

  let importBusy = false;
  let importError = '';
  let importSuccess = '';
  let importStorage = null;
  let importToolId = 'skills';
  let importName = 'skills';
  let importDescription = 'Imported registry record used to prove governed OpenClaw skills execution.';
  let importSchemaText = '{}';

  $: categories = ['all', ...Array.from(new Set(items.map((item) => item.category || 'uncategorized')))].sort();
  $: filtered = items.filter((item) => {
    if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      String(item.name || '').toLowerCase().includes(query) ||
      String(item.description || '').toLowerCase().includes(query) ||
      String(item.toolId || '').toLowerCase().includes(query) ||
      String(item.source || '').toLowerCase().includes(query)
    );
  });

  function canRunGovernedProof(skill) {
    return String(skill?.toolId || '').toLowerCase() === 'skills';
  }

  function sourceLabel(skill) {
    return skill.source === 'registry' ? 'Registry import' : 'OpenClaw CLI';
  }

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

  async function handleImport() {
    importBusy = true;
    importError = '';
    importSuccess = '';
    importStorage = null;

    let schema;
    try {
      schema = importSchemaText.trim() ? JSON.parse(importSchemaText) : {};
    } catch (err) {
      importBusy = false;
      importError = err instanceof Error ? err.message : 'Schema must be valid JSON.';
      return;
    }

    try {
      const response = await postJson('/api/skills/import', {
        toolId: importToolId,
        name: importName,
        description: importDescription,
        schema,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        importError = payload?.error || `Import failed (${response.status})`;
        return;
      }
      importSuccess = `Imported ${payload.tool?.toolId || importToolId}`;
      importStorage = payload?.storage || null;
      invalidateCache('/api/skills');
      await refresh();
    } catch (err) {
      importError = err instanceof Error ? err.message : String(err);
    } finally {
      importBusy = false;
    }
  }

  async function runSmokeTest(skillId) {
    smokeTests = {
      ...smokeTests,
      [skillId]: { loading: true, result: null, error: '' },
    };
    try {
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
    } catch (err) {
      smokeTests = {
        ...smokeTests,
        [skillId]: { loading: false, result: null, error: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  async function runGovernedExecution(skillId, command) {
    governedRuns = {
      ...governedRuns,
      [skillId]: { loading: true, command, result: null, proof: null, error: '' },
    };
    try {
      const response = await postJson(`/api/skills/${skillId}/governed-execution`, { command });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        governedRuns = {
          ...governedRuns,
          [skillId]: {
            loading: false,
            command,
            result: null,
            proof: payload?.proof || null,
            error: payload?.error || `Governed execution failed (${response.status})`,
          },
        };
        return;
      }
      governedRuns = {
        ...governedRuns,
        [skillId]: {
          loading: false,
          command,
          result: payload.result,
          proof: payload.proof || null,
          error: '',
        },
      };
    } catch (err) {
      governedRuns = {
        ...governedRuns,
        [skillId]: {
          loading: false,
          command,
          result: null,
          proof: null,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
</script>

<AppShell>
  <section class="page">
    <section class="card section">
      <div class="hero">
        <div>
          <h1>Skills Toolbox</h1>
          <p class="muted">Import registry skills, inspect the normalized catalog, and run a governed OpenClaw proof for the `skills` tool.</p>
        </div>
        <button class="pill subtle" on:click={refresh} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
      </div>

      <div class="import-grid">
        <label>
          <span>Tool ID</span>
          <input bind:value={importToolId} placeholder="skills" />
        </label>
        <label>
          <span>Name</span>
          <input bind:value={importName} placeholder="skills" />
        </label>
      </div>

      <label class="stack">
        <span>Description</span>
        <textarea rows="2" bind:value={importDescription} placeholder="Describe the imported skill record."></textarea>
      </label>

      <label class="stack">
        <span>Schema JSON</span>
        <textarea rows="4" bind:value={importSchemaText} placeholder="JSON object"></textarea>
      </label>

      <div class="row">
        <button class="pill cta" on:click={handleImport} disabled={importBusy}>
          {importBusy ? 'Importing...' : 'Import Skill'}
        </button>
        <span class="muted">Use `skills` here if you want the card below to prove real governed backend execution.</span>
      </div>

      {#if importError}<p class="err">{importError}</p>{/if}
      {#if importSuccess}<p class="ok">{importSuccess}</p>{/if}
      {#if importStorage?.registryRecord}
        <div class="result">
          <p class="ok">Stored in backend registry · {importStorage.registryRecord.toolId}</p>
          <pre>{JSON.stringify(importStorage.registryRecord, null, 2)}</pre>
        </div>
      {/if}

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
                <div class="skill-meta">
                  <span class:registry={skill.source === 'registry'} class:cli={skill.source !== 'registry'} class="pill source">{sourceLabel(skill)}</span>
                  <span class="pill">{skill.category}</span>
                </div>
              </div>
              <p>{skill.description}</p>
              <div class="tags">
                {#each skill.tags || [] as tag}
                  <span class="tag">{tag}</span>
                {/each}
              </div>
              <div class="row actions">
                <span class="muted">{skill.status}</span>
                <div class="action-group">
                  <button class="pill subtle" on:click={() => runSmokeTest(skill.toolId)} disabled={smokeTests[skill.toolId]?.loading}>
                    {smokeTests[skill.toolId]?.loading ? 'Testing...' : 'Smoke Test'}
                  </button>
                  {#if canRunGovernedProof(skill)}
                    <button class="pill cta" on:click={() => runGovernedExecution(skill.toolId, 'list')} disabled={governedRuns[skill.toolId]?.loading}>
                      {governedRuns[skill.toolId]?.loading && governedRuns[skill.toolId]?.command === 'list' ? 'Running...' : 'Governed List Proof'}
                    </button>
                    <button class="pill cta secondary" on:click={() => runGovernedExecution(skill.toolId, 'check')} disabled={governedRuns[skill.toolId]?.loading}>
                      {governedRuns[skill.toolId]?.loading && governedRuns[skill.toolId]?.command === 'check' ? 'Running...' : 'Governed Check Proof'}
                    </button>
                  {/if}
                </div>
              </div>

              {#if smokeTests[skill.toolId]?.error}
                <p class="err">{smokeTests[skill.toolId].error}</p>
              {/if}
              {#if smokeTests[skill.toolId]?.result}
                <div class="result">
                  <p class:ok={smokeTests[skill.toolId].result.passed} class:err={!smokeTests[skill.toolId].result.passed}>
                    {smokeTests[skill.toolId].result.passed ? 'PASS' : 'FAIL'} · Smoke Test · {smokeTests[skill.toolId].result.checkedAt}
                  </p>
                  <ul>
                    {#each smokeTests[skill.toolId].result.logs || [] as line}
                      <li>{line}</li>
                    {/each}
                  </ul>
                </div>
              {/if}

              {#if governedRuns[skill.toolId]?.error}
                <div class="result">
                  <p class="err">{governedRuns[skill.toolId].error}</p>
                  {#if governedRuns[skill.toolId].proof}
                    <pre>{JSON.stringify(governedRuns[skill.toolId].proof, null, 2)}</pre>
                  {/if}
                </div>
              {/if}
              {#if governedRuns[skill.toolId]?.result}
                <div class="result proof">
                  <p class="ok">Governed {governedRuns[skill.toolId].command} proof succeeded</p>
                  <pre>{JSON.stringify(governedRuns[skill.toolId].result, null, 2)}</pre>
                  {#if governedRuns[skill.toolId].proof}
                    <p class="muted">Storage and audit evidence</p>
                    <pre>{JSON.stringify(governedRuns[skill.toolId].proof, null, 2)}</pre>
                  {/if}
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
  .hero, .skill-head, .row { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
  .hero { align-items: flex-start; }
  .filters, .import-grid, .action-group, .skill-meta, .tags { display: flex; gap: 8px; flex-wrap: wrap; }
  .import-grid { margin-top: 14px; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
  .skill { border: 1px solid var(--row-border); border-radius: 14px; padding: 12px; background: var(--row-bg); display: grid; gap: 10px; }
  .stack { display: grid; gap: 6px; margin-top: 12px; }
  label span { display: block; margin-bottom: 6px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
  .tag, .pill { padding: 4px 8px; border-radius: 999px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--fg); font-size: 12px; }
  .source.registry { border-color: rgba(34,197,94,.32); background: rgba(34,197,94,.12); }
  .source.cli { border-color: rgba(56,189,248,.32); background: rgba(56,189,248,.12); }
  .cta { border-color: rgba(249,115,22,.45); background: rgba(249,115,22,.2); cursor: pointer; }
  .cta.secondary { border-color: rgba(245,158,11,.32); background: rgba(245,158,11,.12); }
  .subtle { cursor: pointer; }
  input, select, textarea {
    width: 100%;
    border: 1px solid var(--input-border);
    border-radius: 12px;
    background: var(--input-bg);
    color: var(--fg);
    padding: 9px 11px;
    outline: none;
    box-sizing: border-box;
  }
  textarea { resize: vertical; min-height: 84px; }
  h1, h2, p, ul, pre { margin: 0; }
  ul { padding-left: 18px; }
  pre {
    padding: 10px;
    border-radius: 12px;
    overflow: auto;
    background: var(--pre-bg);
    color: var(--muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .mono, .muted { color: var(--muted); }
  .ok { color: var(--ok); }
  .err { color: var(--warn); }
  .result { display: grid; gap: 8px; padding: 10px; border-radius: 12px; background: var(--row-bg); }
  .proof { border: 1px solid rgba(249,115,22,.22); }
  .actions { align-items: flex-start; }

  @media (max-width: 720px) {
    .hero, .row, .skill-head { flex-direction: column; align-items: flex-start; }
    .action-group { width: 100%; }
  }
</style>
