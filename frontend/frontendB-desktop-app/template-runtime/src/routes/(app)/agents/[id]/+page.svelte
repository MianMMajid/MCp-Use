<script>
  import { onMount, afterUpdate } from 'svelte';
  import { goto } from '$app/navigation';
  import AppShell from '@/lib/components/AppShell.svelte';
  import Icon from '@/lib/components/icons/Icon.svelte';
  import ConfirmDialog from '@/lib/components/ConfirmDialog.svelte';
  import { loadJson, patchJson, postJson, deleteJson, invalidateCache } from '@/lib/api';
  import { chatStore } from '@/lib/stores/chat-store';
  import { humanizeError } from '@/lib/utils/error-display';
  import { toastStore } from '@/lib/stores/toast-store';
  import { statusColor } from '@/lib/format';

  export let data;
  let _loadedId = '';

  let loading = true;
  let saving = false;
  let error = '';
  let agent = null;
  let agentName = '';
  let toolSearch = '';
  let openclawTools = [];
  let equippedToolIds = [];
  let draggedSkillId = '';
  let equippedDropActive = false;
  let draggingFromCatalog = false;
  let selectedCatalogCategory = 'all';
  let selectedProfileId = '';
  let highlightedToolIds = new Set();
  let hoveredSkillId = '';

  // ── Marketplace state ──
  let importOpen = false;
  let marketplaceItems = [];
  let marketplaceLoading = false;
  let marketplaceSearch = '';
  let installing = {};
  let apiKeys = {};
  let expandedServer = null;

  async function loadMarketplace() {
    marketplaceLoading = true;
    try {
      const params = new URLSearchParams();
      if (marketplaceSearch) params.set('q', marketplaceSearch);
      params.set('transport', 'remote');
      const data = await loadJson(`/api/skills/marketplace?${params}`, { silent: true });
      marketplaceItems = data?.items || [];
    } catch (err) {
      toastStore.error(humanizeError(err instanceof Error ? err.message : String(err)));
    } finally { marketplaceLoading = false; }
  }

  function isSkillInstalled(serverName) {
    const toolId = serverName.replace(/[^a-zA-Z0-9._:-]/g, '-');
    return openclawTools.some((t) => t.toolId === toolId || t.toolId === serverName);
  }

  async function installFromMarketplace(server) {
    installing = { ...installing, [server.name]: true };
    try {
      const body = { name: server.name };
      if (apiKeys[server.name]) body.apiKey = apiKeys[server.name];
      const res = await postJson('/api/skills/marketplace/install', body);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        installing = { ...installing, [server.name]: false };
        return;
      }
      installing = { ...installing, [server.name]: 'done' };
      expandedServer = null;
      invalidateCache('/api/skills');
      invalidateCache(`/api/agents/${data.id}/tools`);
      _loadedId = '';
      toastStore.success(`${server.name} installed`);
      await loadPage();
    } catch (err) {
      installing = { ...installing, [server.name]: false };
      toastStore.error(humanizeError(err instanceof Error ? err.message : String(err)));
    }
  }

  // ── Smoke test & governed proof state ──
  let smokeTests = {};
  let governedRuns = {};

  // ── Delete agent state ──
  let deleteConfirmOpen = false;
  let deletingAgent = false;

  async function deleteAgent() {
    if (deletingAgent) return;
    deletingAgent = true;
    try {
      await deleteJson(`/api/agents/${data.id}`);
      invalidateCache('/api/agents');
      await chatStore.fetchAgents();
      if ($chatStore.selectedAgentId === String(data.id)) {
        chatStore.selectAgent('');
      }
      toastStore.success(`Agent "${agentName || data.id}" deleted`);
      goto('/orchestrate');
    } catch (err) {
      toastStore.error(humanizeError(err instanceof Error ? err.message : String(err)));
    } finally {
      deletingAgent = false;
    }
  }

  function canRunGovernedProof(skill) {
    return String(skill?.toolId || '').toLowerCase() === 'skills';
  }


  async function runSmokeTest(skillId) {
    smokeTests = { ...smokeTests, [skillId]: { loading: true, result: null, error: '' } };
    try {
      const response = await postJson(`/api/skills/${skillId}/smoke-test`, {});
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        smokeTests = { ...smokeTests, [skillId]: { loading: false, result: null, error: payload?.error || 'Test failed' } };
        return;
      }
      smokeTests = { ...smokeTests, [skillId]: { loading: false, result: payload.result, error: '' } };
    } catch (err) {
      smokeTests = { ...smokeTests, [skillId]: { loading: false, result: null, error: err instanceof Error ? err.message : String(err) } };
    }
  }

  async function runGovernedExecution(skillId, command) {
    governedRuns = { ...governedRuns, [skillId]: { loading: true, command, result: null, proof: null, error: '' } };
    try {
      const response = await postJson(`/api/skills/${skillId}/governed-execution`, { command });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        governedRuns = { ...governedRuns, [skillId]: { loading: false, command, result: null, proof: payload?.proof || null, error: payload?.error || 'Failed' } };
        return;
      }
      governedRuns = { ...governedRuns, [skillId]: { loading: false, command, result: payload.result, proof: payload.proof || null, error: '' } };
    } catch (err) {
      governedRuns = { ...governedRuns, [skillId]: { loading: false, command, result: null, proof: null, error: err instanceof Error ? err.message : String(err) } };
    }
  }

  const quickProfiles = [
    {
      id: 'incident-response',
      label: 'Incident Response',
      toolIds: ['trace-list', 'firewall-preview', 'policy-validate', 'slack.post_message'],
    },
    {
      id: 'engineering-manager',
      label: 'Engineering Manager',
      toolIds: ['github.search_prs', 'github.create_pr_comment', 'slack.post_message'],
    },
    {
      id: 'comms-ops',
      label: 'Comms Ops',
      toolIds: ['email.send', 'calendar.find_slots', 'slack.post_message'],
    },
  ];

  const catalogCategories = [
    { id: 'all', label: 'All Tools' },
    { id: 'communication', label: 'Communication' },
    { id: 'engineering', label: 'Engineering' },
    { id: 'security', label: 'Security' },
    { id: 'data', label: 'Data' },
    { id: 'automation', label: 'Automation' },
    { id: 'custom', label: 'Custom' },
  ];

  $: allSkills = [
    ...openclawTools,
  ];

  $: allSkillsById = new Map(allSkills.map((item) => [String(item.toolId || item.name), item]));
  $: equippedSet = new Set(equippedToolIds.map(String));
  $: equippedSkills = equippedToolIds.map((id) => allSkillsById.get(String(id)) || {
    toolId: String(id),
    name: String(id),
    description: 'Configured backend skill',
    source: 'registry',
  });

  $: filteredAvailableSkills = allSkills.filter((item) => {
    const id = String(item.toolId || item.name);
    if (equippedSet.has(id)) return false;
    if (selectedCatalogCategory !== 'all' && catalogCategory(item) !== selectedCatalogCategory) return false;
    if (!toolSearch.trim()) return true;
    const query = toolSearch.toLowerCase();
    return String(item.name || '').toLowerCase().includes(query) || String(item.description || '').toLowerCase().includes(query) || id.toLowerCase().includes(query);
  });

  $: categoryCounts = new Map(catalogCategories.map((category) => [
    category.id,
    category.id === 'all'
      ? allSkills.length
      : allSkills.filter((item) => catalogCategory(item) === category.id).length,
  ]));

  $: categoryMatchCounts = new Map(catalogCategories.map((category) => {
    const matches = allSkills.filter((item) => {
      const id = String(item.toolId || item.name);
      if (equippedSet.has(id)) return false;
      if (category.id !== 'all' && catalogCategory(item) !== category.id) return false;
      if (!toolSearch.trim()) return true;
      const query = toolSearch.toLowerCase();
      return String(item.name || '').toLowerCase().includes(query) || String(item.description || '').toLowerCase().includes(query) || id.toLowerCase().includes(query);
    }).length;
    return [category.id, matches];
  }));

  function badgeClass(value) {
    const color = statusColor(value);
    if (color === 'green') return 'badge green';
    if (color === 'red') return 'badge red';
    if (color === 'sky') return 'badge info';
    if (color === 'caution' || color === 'orange') return 'badge caution';
    return 'badge zinc';
  }

  async function loadPage() {
    if (_loadedId === data.id && agent) return;
    _loadedId = data.id;
    loading = true;
    error = '';
    try {
      const [agentPayload, toolsPayload] = await Promise.all([
        loadJson(`/api/agents/${data.id}`),
        loadJson(`/api/agents/${data.id}/tools`).catch(() => ({ items: [], equippedToolIds: [] })),
      ]);

      agent = agentPayload;
      openclawTools = Array.isArray(toolsPayload?.items)
        ? toolsPayload.items.map((item) => ({ ...item, toolId: String(item.toolId || item.name) }))
        : [];
      equippedToolIds = Array.isArray(toolsPayload?.equippedToolIds)
        ? toolsPayload.equippedToolIds.map(String)
        : (Array.isArray(agentPayload?.equippedToolIds) ? agentPayload.equippedToolIds.map(String) : []);
      agentName = String(agentPayload?.name || agentPayload?.displayName || data.id || '');
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  onMount(loadPage);
  // Re-fetch when route param changes (same-route navigation)
  $: data.id, loadPage();

  function equipSkill(skillId) {
    const id = String(skillId || '');
    if (!id || equippedSet.has(id)) return;
    equippedToolIds = [...equippedToolIds, id];
  }

  function unequipSkill(skillId) {
    const id = String(skillId || '');
    equippedToolIds = equippedToolIds.filter((item) => String(item) !== id);
  }

  function applyProfile(profile) {
    const allowed = new Set(allSkills.map((item) => String(item.toolId || item.name)));
    equippedToolIds = profile.toolIds.filter((item) => allowed.has(String(item)));
    selectedProfileId = profile.id;
    highlightedToolIds = new Set(profile.toolIds.map(String));
  }

  function catalogCategory(skill) {
    const id = String(skill?.toolId || skill?.name || '').toLowerCase();
    if (id.includes('slack') || id.includes('email') || id.includes('calendar') || id.includes('message')) return 'communication';
    if (id.includes('github') || id.includes('patch') || id.includes('exec') || id.includes('file')) return 'engineering';
    if (id.includes('firewall') || id.includes('policy') || id.includes('risk') || id.includes('trace')) return 'security';
    if (id.includes('search') || id.includes('fetch') || id.includes('pdf') || id.includes('image')) return 'data';
    if (id.includes('cron') || id.includes('spawn') || id.includes('heartbeat') || id.includes('loop')) return 'automation';
    return 'engineering';
  }

  function skillIcon(skill) {
    const id = String(skill?.toolId || skill?.name || '').toLowerCase();
    if (id.includes('github')) return 'GH';
    if (id.includes('slack')) return 'SL';
    if (id.includes('email')) return 'EM';
    if (id.includes('calendar')) return 'CL';
    if (id.includes('exec')) return '>';
    if (id.includes('patch')) return 'Δ';
    if (id.includes('search')) return '◯';
    if (id.includes('pdf')) return 'PDF';
    if (id.includes('image')) return 'IMG';
    if (id.includes('cron')) return '⏲';
    return 'OC';
  }

  function skillIconClass(skill) {
    const id = String(skill?.toolId || skill?.name || '').toLowerCase();
    if (id.includes('github')) return 'brand-github';
    if (id.includes('slack')) return 'brand-slack';
    if (id.includes('email')) return 'brand-email';
    if (id.includes('calendar')) return 'brand-calendar';
    return 'brand-openclaw';
  }

  function onCatalogDragStart(event, skillId) {
    draggedSkillId = String(skillId);
    draggingFromCatalog = true;
    event.dataTransfer.setData('application/mayple-skill', String(skillId));
    event.dataTransfer.effectAllowed = 'copy';
  }

  function onCatalogDragEnd() {
    draggingFromCatalog = false;
    equippedDropActive = false;
  }

  function onEquippedDrop(event) {
    event.preventDefault();
    equippedDropActive = false;
    const skillId = event.dataTransfer.getData('application/mayple-skill') || draggedSkillId;
    equipSkill(skillId);
    draggedSkillId = '';
    draggingFromCatalog = false;
  }

  function onEquippedDragOver(event) {
    event.preventDefault();
    equippedDropActive = true;
    event.dataTransfer.dropEffect = 'copy';
  }

  function onEquippedDragLeave() {
    equippedDropActive = false;
  }

  function selectCategory(categoryId) {
    const matches = categoryMatchCounts.get(categoryId) || 0;
    if (matches === 0 && categoryId !== 'all') return;
    selectedCatalogCategory = categoryId;
  }

  async function saveToolbelt() {
    if (!agent) return;
    saving = true;
    error = '';
    try {
      const trimmedName = String(agentName || '').trim();
      // Use data.id (from route param) instead of stale agent closure
      const agentId = data.id;
      if (trimmedName && trimmedName !== String(agent.name || '')) {
        const agentRes = await patchJson(`/api/agents/${agentId}`, { name: trimmedName });
        const agentPayload = await agentRes.json().catch(() => ({}));
        if (!agentRes.ok || agentPayload?.ok === false) {
          throw new Error(agentPayload?.error || `Failed to update agent name (${agentRes.status})`);
        }
        agent = { ...agent, ...agentPayload, name: trimmedName };
      }

      const response = await patchJson(`/api/agents/${agentId}/tools`, { equippedToolIds });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `Failed to save toolbelt (${response.status})`);
      }
      equippedToolIds = Array.isArray(payload?.equippedToolIds)
        ? payload.equippedToolIds.map(String)
        : equippedToolIds;
      agent = { ...agent, equippedToolIds: equippedToolIds.slice() };
      invalidateCache('/api/agents');
      toastStore.success('Toolbelt saved');
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      toastStore.error(humanizeError(error));
    } finally {
      saving = false;
    }
  }

  async function createAgent() {
    await saveToolbelt();
    if (!error) goto('/agents');
  }
</script>

<AppShell>
  <section class="page">
    {#if loading}
      <section class="card panel"><p class="muted">Loading Openclaw agent…</p></section>
    {:else if error}
      <section class="card panel" style="text-align:center; padding:32px;">
        <p class="err">{humanizeError(error)}</p>
        <button class="pill" style="margin-top:12px; cursor:pointer;" on:click={() => goto('/orchestrate')}>Back to Builder</button>
      </section>
    {:else}
      <section class="card panel identity">
        <div class="top">
          <button class="pill back-icon" aria-label="Back to agents" title="Back to agents" on:click={() => goto('/agents')}>
            <Icon name="arrow-left" size={16} />
          </button>
          <div class="name-wrap">
            <label>
              <span>Agent Name</span>
              <input bind:value={agentName} placeholder="Name your agent..." />
            </label>
          </div>
          <span class={badgeClass(agent?.status || 'unknown')}>{agent?.status || 'unknown'}</span>
          <button class="pill cta" on:click={createAgent} disabled={saving}>{saving ? 'Creating…' : 'Create Agent'}</button>
          <button class="pill danger-pill" on:click={() => (deleteConfirmOpen = true)} disabled={deletingAgent} title="Delete agent">
            <Icon name="close" size={14} />
          </button>
        </div>

      </section>

      <section class="card panel tools">
        <div class="tools-head">
          <div>
            <h2>Openclaw Toolbelt</h2>
            <p>Browse tools by category and drag them into the equipped zone.</p>
          </div>
        </div>

        <div class="profile-row">
          {#each quickProfiles as profile}
            <button class="pill profile" class:active={selectedProfileId === profile.id} on:click={() => applyProfile(profile)}>
              {profile.label}
            </button>
          {/each}
        </div>

        <div class="toolbelt-layout">
          <aside class="catalog-nav">
            <h3>Categories</h3>
            <div class="category-list">
              {#each catalogCategories as category}
                <button
                  class="pill category-pill"
                  class:active={selectedCatalogCategory === category.id}
                  class:disabled={(categoryMatchCounts.get(category.id) || 0) === 0 && category.id !== 'all'}
                  disabled={(categoryMatchCounts.get(category.id) || 0) === 0 && category.id !== 'all'}
                  on:click={() => selectCategory(category.id)}
                >
                  <span>{category.label}</span>
                  <small>{categoryMatchCounts.get(category.id) || 0}</small>
                </button>
              {/each}
            </div>
          </aside>

          <section class="catalog">
            <div class="catalog-head">
              <h3>Skill Catalog</h3>
              <div class="catalog-actions">
                <button class="pill subtle" on:click={() => { importOpen = !importOpen; if (importOpen && marketplaceItems.length === 0) loadMarketplace(); }}>
                  {importOpen ? 'Close' : '+ Add from Marketplace'}
                </button>
                <div class="search">
                  <span class="search-icon"><Icon name="search" size={14} /></span>
                  <input bind:value={toolSearch} placeholder="Search tools..." />
                </div>
              </div>
            </div>

            {#if importOpen}
              <div class="import-form">
                <div class="mp-search-row">
                  <input bind:value={marketplaceSearch} placeholder="Search MCP servers..." on:keydown={(e) => e.key === 'Enter' && loadMarketplace()} />
                  <button class="pill subtle" on:click={loadMarketplace} disabled={marketplaceLoading}>{marketplaceLoading ? '...' : 'Search'}</button>
                </div>
                <div class="mp-list">
                  {#if marketplaceLoading && marketplaceItems.length === 0}
                    <p class="muted">Searching MCP registry...</p>
                  {:else if marketplaceItems.length === 0}
                    <p class="muted">No servers found.</p>
                  {:else}
                    {#each marketplaceItems as server}
                      <div class="mp-item">
                        <div class="mp-head">
                          <div>
                            <p class="mp-name">{server.title || server.name}</p>
                            <small class="muted">{server.name}</small>
                          </div>
                          {#if isSkillInstalled(server.name)}
                            <span class="badge ok">installed</span>
                          {:else if expandedServer === server.name}
                            <button class="pill subtle" on:click={() => expandedServer = null}>Cancel</button>
                          {:else}
                            <button class="pill cta" on:click={() => expandedServer = server.name}>Install</button>
                          {/if}
                        </div>
                        <p class="mp-desc muted">{server.description}</p>
                        {#if expandedServer === server.name}
                          <div class="mp-auth">
                            {#if server.authHeaders?.[0]?.description}
                              <p class="mp-auth-desc muted">{server.authHeaders[0].description}</p>
                            {/if}
                            <div class="mp-auth-row">
                              <input type="password" placeholder="API key (optional for free servers)" bind:value={apiKeys[server.name]} on:keydown={(e) => e.key === 'Enter' && installFromMarketplace(server)} />
                              <button class="pill cta" on:click={() => installFromMarketplace(server)} disabled={!!installing[server.name] || (server.requiresAuth && !apiKeys[server.name])}>
                                {installing[server.name] === 'done' ? '✓' : installing[server.name] ? '...' : 'Connect'}
                              </button>
                            </div>
                            {#if server.repository}
                              <a href={server.repository} target="_blank" class="muted" style="font-size:11px; text-decoration:underline;">Repo ↗</a>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/each}
                  {/if}
                </div>
              </div>
            {/if}
            {#if filteredAvailableSkills.length === 0}
              <p class="muted">No available skills for this filter.</p>
            {:else}
              <div class="tool-grid">
                {#each filteredAvailableSkills as tool}
                  {@const id = String(tool.toolId || tool.name)}
                  <article
                    class="tool-item"
                    class:recommended={highlightedToolIds.has(id)}
                    draggable="true"
                    on:mouseenter={() => (hoveredSkillId = id)}
                    on:mouseleave={() => (hoveredSkillId = '')}
                    on:dragstart={(event) => onCatalogDragStart(event, id)}
                    on:dragend={onCatalogDragEnd}
                  >
                    <div class="tool-top">
                      <div class="tool-title">
                        <span class={`tool-icon ${skillIconClass(tool)}`}>{skillIcon(tool)}</span>
                        <p>{tool.name || id}</p>
                      </div>
                    </div>
                    <p class="tool-desc">{tool.description || 'Openclaw-compatible tool'}</p>
                    <div class="tool-foot">
                      <span class="source-tag">{tool.source || 'openclaw'}</span>
                      <button
                        class="pill mini test-btn"
                        title="Smoke test"
                        disabled={smokeTests[id]?.loading || draggingFromCatalog}
                        on:click|stopPropagation={() => runSmokeTest(id)}
                      >
                        {smokeTests[id]?.loading ? '...' : 'Test'}
                      </button>
                      {#if canRunGovernedProof(tool)}
                        <button
                          class="pill mini proof-btn"
                          title="Governed proof"
                          disabled={governedRuns[id]?.loading || draggingFromCatalog}
                          on:click|stopPropagation={() => runGovernedExecution(id, 'list')}
                        >
                          {governedRuns[id]?.loading ? '...' : 'Proof'}
                        </button>
                      {/if}
                      <button class="pill mini" title="Add skill" on:click={() => equipSkill(id)}>+</button>
                    </div>
                    {#if smokeTests[id]?.result}
                      <div class="test-result" class:pass={smokeTests[id].result.passed} class:fail={!smokeTests[id].result.passed}>
                        {smokeTests[id].result.passed ? 'PASS' : 'FAIL'}
                      </div>
                    {/if}
                    {#if smokeTests[id]?.error}
                      <p class="test-err">{smokeTests[id].error}</p>
                    {/if}
                    {#if governedRuns[id]?.result}
                      <div class="test-result pass">Governed proof ✓</div>
                    {/if}
                    {#if governedRuns[id]?.error}
                      <p class="test-err">{governedRuns[id].error}</p>
                    {/if}
                  </article>
                {/each}
              </div>
            {/if}
          </section>
        </div>

        <section
          class="equipped-zone equipped-dock"
          aria-label="Equipped skills drop zone"
          class:drag-active={equippedDropActive}
          class:hover-glow={hoveredSkillId !== '' || draggingFromCatalog}
          class:compact={equippedSkills.length === 0}
          on:dragover={onEquippedDragOver}
          on:dragleave={onEquippedDragLeave}
          on:drop={onEquippedDrop}
        >
          <div class="equipped-head">
            <h3>Equipped Skills (Drop Here)</h3>
            <span class="pill count">{equippedToolIds.length}</span>
          </div>

          {#if equippedSkills.length === 0}
            <div class="empty-state">
              <div class="ghost-icon"><Icon name="spark" size={28} /></div>
              <p>Drag skills here to power up your agent.</p>
            </div>
          {:else}
            <div class="equipped-list horizontal">
              {#each equippedSkills as tool}
                {@const id = String(tool.toolId || tool.name)}
                <article class="equipped-item">
                  <div>
                    <p class="skill-name">{tool.name || id}</p>
                    <p class="muted">{tool.description || 'Custom skill'}</p>
                  </div>
                  <button class="pill danger" on:click={() => unequipSkill(id)}>Remove</button>
                </article>
              {/each}
            </div>
          {/if}
        </section>
      </section>
    {/if}
  </section>
</AppShell>

<ConfirmDialog
  bind:open={deleteConfirmOpen}
  title="Delete Agent"
  message={`Are you sure you want to delete "${agentName || data.id}"? This action cannot be undone.`}
  confirmLabel="Delete"
  danger
  onConfirm={deleteAgent}
/>

<style>
  .page { min-height: calc(100svh - 92px); display: grid; gap: 10px; }
  .panel { padding: 12px; display: grid; gap: 10px; }

  .top { display: flex; align-items: center; gap: 8px; }
  h2 { margin: 0; font-size: 1rem; }
  h3 { margin: 0; font-size: 13px; }
  .name-wrap { flex: 1; min-width: 240px; }
  .name-wrap label span { display: block; margin-bottom: 4px; color: var(--muted); font-size: 11px; text-transform: lowercase; }
  .name-wrap input {
    width: 100%;
    border: 1px solid var(--input-border);
    border-radius: 10px;
    background: var(--input-bg);
    color: var(--fg);
    padding: 7px 9px;
    outline: none;
  }

  .muted { margin: 0; color: var(--muted); font-size: 13px; }

  .back-icon {
    width: 30px;
    height: 30px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-color: rgba(249,115,22,.35);
    background: var(--btn-secondary-bg);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
  }

  .tools-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 2px 0 4px; }
  .tools-head p { margin: 3px 0 0; color: var(--muted); font-size: 12px; }
  .cta { padding: 7px 11px; border-color: rgba(249,115,22,.5); background: rgba(249,115,22,.2); cursor: pointer; }
  .danger-pill { padding: 7px 9px; border-color: var(--danger-border); background: var(--danger-soft); color: var(--danger); cursor: pointer; }
  .danger-pill:hover { background: var(--danger); color: #fff; }

  .profile-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .profile { padding: 6px 10px; border-color: rgba(249,115,22,.3); background: var(--btn-secondary-bg); cursor: pointer; font-size: 12px; }
  .profile.active { border-color: rgba(249,115,22,.58); background: rgba(249,115,22,.24); }

  .search { min-height: 42px; padding: 7px 10px; display: flex; align-items: center; gap: 8px; border: 1.5px solid rgba(249,115,22,.28); border-radius: 12px; background: var(--input-bg); min-width: 280px; }
  .search-icon { color: var(--muted); font-size: 15px; }
  .search input { width: 100%; border: 0; outline: none; background: transparent; color: var(--fg); font-size: 14px; }

  .toolbelt-layout { display: grid; gap: 10px; grid-template-columns: 220px 1fr; }

  .catalog-nav, .catalog, .equipped-zone {
    border: 1px solid var(--row-border);
    border-radius: 14px;
    background: var(--row-bg);
    padding: 10px;
    display: grid;
    gap: 8px;
    min-height: 280px;
  }

  .catalog-nav { align-content: start; gap: 10px; background: var(--card-bg); border-color: rgba(148,163,184,.2); }
  .category-list { display: grid; gap: 7px; }
  .category-pill { display: flex; justify-content: space-between; align-items: center; padding: 7px 10px; border-color: var(--row-border); background: var(--row-bg); cursor: pointer; font-size: 12px; }
  .category-pill small { color: var(--muted); font-size: 10px; }
  .category-pill.active { border-color: rgba(249,115,22,.6); background: rgba(249,115,22,.2); box-shadow: inset 3px 0 0 rgba(249,115,22,.92); }
  .category-pill.disabled { opacity: .45; cursor: not-allowed; border-style: dashed; }

  .catalog-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .catalog-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

  /* Marketplace in agent editor */
  .import-form { border: 1px solid var(--border); border-radius: 12px; background: var(--row-bg); padding: 10px; display: grid; gap: 8px; margin-top: 8px; }
  .mp-search-row { display: flex; gap: 6px; }
  .mp-search-row input { flex: 1; border: 1px solid var(--input-border); border-radius: 999px; background: var(--input-bg); color: var(--fg); padding: 7px 12px; font-size: 12px; outline: none; }
  .mp-list { max-height: 320px; overflow-y: auto; display: grid; gap: 6px; }
  .mp-item { border: 1px solid var(--border); border-radius: 10px; background: var(--bg-elevated); padding: 8px 10px; display: grid; gap: 4px; }
  .mp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .mp-name { margin: 0; font-size: 12px; font-weight: 600; }
  .mp-desc { margin: 0; font-size: 11px; line-height: 1.4; display: -webkit-box; line-clamp: 2; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .mp-auth { display: grid; gap: 4px; padding-top: 4px; border-top: 1px solid var(--border); }
  .mp-auth-desc { margin: 0; font-size: 10px; }
  .mp-auth-row { display: flex; gap: 6px; }
  .mp-auth-row input { flex: 1; border: 1px solid rgba(249,115,22,.3); border-radius: 999px; background: rgba(249,115,22,.06); color: var(--fg); padding: 6px 10px; font-size: 11px; outline: none; font-family: ui-monospace, monospace; }
  .badge.ok { color: var(--ok); border-color: rgba(16,185,129,.3); background: rgba(16,185,129,.1); }

  /* Test result badges */
  .test-btn, .proof-btn { font-size: 11px; padding: 2px 6px; }
  .test-result { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; text-align: center; }
  .test-result.pass { color: var(--ok); background: var(--ok-soft); }
  .test-result.fail { color: var(--warn); background: rgba(207, 94, 94, 0.12); }
  .test-err { margin: 0; font-size: 11px; color: var(--warn); }

  .equipped-zone.drag-active {
    border-color: rgba(249,115,22,.7);
    border-style: dashed;
    box-shadow: inset 0 0 0 1px rgba(249,115,22,.35), 0 0 0 8px rgba(249,115,22,.08);
    background: var(--accent-soft);
  }

  .tool-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); align-content: start; }
  .tool-item {
    border: 1px solid var(--row-border);
    border-radius: 12px;
    background: var(--input-bg);
    color: inherit;
    text-align: left;
    padding: 9px;
    display: grid;
    gap: 6px;
    cursor: grab;
  }
  .tool-item.recommended { border-color: rgba(249,115,22,.48); box-shadow: inset 0 0 0 1px rgba(249,115,22,.2); }
  .tool-item:hover { border-color: rgba(249,115,22,.44); }

  .tool-top { display: flex; align-items: start; gap: 8px; justify-content: space-between; }
  .tool-title { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .tool-top p { margin: 0; font-size: 12px; font-weight: 600; line-height: 1.2; }
  .tool-icon { width: 24px; height: 24px; border-radius: 999px; border: 1px solid rgba(148,163,184,.28); display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; color: #e2e8f0; flex-shrink: 0; }
  .tool-icon.brand-github { background: #111827; border-color: #374151; }
  .tool-icon.brand-slack { background: #4a154b; border-color: #9333ea; }
  .tool-icon.brand-email { background: #7f1d1d; border-color: #f97316; }
  .tool-icon.brand-calendar { background: #1e3a8a; border-color: #60a5fa; }
  .tool-icon.brand-openclaw { background: #0f172a; border-color: #475569; }
  .tool-desc { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.35; }
  .tool-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 2px; }
  .source-tag { width: fit-content; padding: 0; font-size: 10px; border: 0; color: #64748b; background: transparent; text-transform: lowercase; opacity: .82; }

  .mini {
    width: 24px;
    height: 24px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-color: rgba(249,115,22,.35);
    background: var(--btn-secondary-bg);
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
    opacity: 0;
    pointer-events: none;
    transition: opacity .14s ease;
  }
  .tool-item:hover .mini { opacity: 1; pointer-events: auto; }

  .equipped-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .equipped-dock { margin-top: 6px; border-style: dashed; border-color: rgba(249,115,22,.34); background: linear-gradient(180deg, var(--row-bg), var(--row-bg)); backdrop-filter: blur(12px); position: sticky; bottom: 10px; z-index: 4; box-shadow: 0 10px 28px rgba(0,0,0,.35); }
  .equipped-dock.compact { min-height: 92px; }
  .equipped-dock.hover-glow { border-color: rgba(249,115,22,.64); box-shadow: 0 0 0 6px rgba(249,115,22,.08); }
  .count { padding: 4px 8px; font-size: 11px; border-color: rgba(249,115,22,.35); background: var(--btn-secondary-bg); }
  .empty-state { min-height: 58px; border: 1px dashed var(--border); border-radius: 12px; background: var(--row-bg); display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 10px; text-align: left; padding: 12px; color: var(--muted); }
  .ghost-icon { width: 28px; height: 28px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid rgba(249,115,22,.34); background: rgba(249,115,22,.16); font-size: 13px; }
  .empty-state p { margin: 0; font-size: 13px; color: var(--muted); }

  .equipped-list { display: grid; gap: 7px; }
  .equipped-list.horizontal { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
  .equipped-item {
    border: 1px solid var(--row-border);
    border-radius: 12px;
    background: var(--input-bg);
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 260px;
  }

  .skill-name { margin: 0; font-size: 13px; font-weight: 600; }

  .danger {
    padding: 5px 8px;
    cursor: pointer;
    border-color: rgba(251,113,133,.4);
    background: rgba(251,113,133,.16);
    font-size: 11px;
  }

  .badge {
    border-radius: 999px;
    padding: 2px 7px;
    font-size: 10px;
    border: 1px solid var(--border);
    color: var(--muted);
    background: rgba(107, 107, 107, 0.08);
    text-transform: lowercase;
  }

  .err { margin: 0; color: var(--warn); }

  .green { color: var(--ok); background: var(--ok-soft); border-color: var(--ok-border); }
  .red { color: var(--danger); background: var(--danger-soft); border-color: var(--danger-border); }
  .info { color: var(--info); background: var(--info-soft); border-color: var(--info-border); }
  .caution { color: var(--caution); background: var(--caution-soft); border-color: var(--caution-border); }
  .zinc { color: var(--muted); background: rgba(107, 107, 107, 0.08); border-color: rgba(107, 107, 107, 0.18); }

  @media (max-width: 1050px) {
    .toolbelt-layout { grid-template-columns: 1fr; }
    .search { min-width: 220px; width: 100%; }
    .equipped-item { min-width: 220px; }
    .catalog-head { grid-template-columns: 1fr; }
    .equipped-dock { position: static; }
  }
</style>
