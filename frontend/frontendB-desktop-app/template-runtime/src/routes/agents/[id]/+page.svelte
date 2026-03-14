<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { loadJson, patchJson } from '@/lib/api';
  import { statusColor } from '@/lib/format';

  export let data;

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
    if (color === 'orange') return 'badge orange';
    return 'badge zinc';
  }

  async function loadPage() {
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
      if (trimmedName && trimmedName !== String(agent.name || '')) {
        const agentRes = await patchJson(`/api/agents/${agent.agentId || agent.id}`, { name: trimmedName });
        const agentPayload = await agentRes.json().catch(() => ({}));
        if (!agentRes.ok || agentPayload?.ok === false) {
          throw new Error(agentPayload?.error || `Failed to update agent name (${agentRes.status})`);
        }
        agent = { ...agent, ...agentPayload, name: trimmedName };
      }

      const response = await patchJson(`/api/agents/${agent.agentId || agent.id}/tools`, { equippedToolIds });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `Failed to save toolbelt (${response.status})`);
      }
      equippedToolIds = Array.isArray(payload?.equippedToolIds)
        ? payload.equippedToolIds.map(String)
        : equippedToolIds;
      agent = { ...agent, equippedToolIds: equippedToolIds.slice() };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
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
      <section class="card panel"><p class="err">{error}</p></section>
    {:else}
      <section class="card panel identity">
        <div class="top">
          <button class="pill back-icon" aria-label="Back to agents" title="Back to agents" on:click={() => goto('/agents')}>
            ←
          </button>
          <div class="name-wrap">
            <label>
              <span>Agent Name</span>
              <input bind:value={agentName} placeholder="Name your agent..." />
            </label>
          </div>
          <span class={badgeClass(agent?.status || 'unknown')}>{agent?.status || 'unknown'}</span>
          <button class="pill cta" on:click={createAgent} disabled={saving}>{saving ? 'Creating…' : 'Create Agent'}</button>
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
              <div class="search">
                <span class="search-icon">⌕</span>
                <input bind:value={toolSearch} placeholder="Search tools..." />
              </div>
            </div>
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
                      <button class="pill mini" title="Add skill" on:click={() => equipSkill(id)}>+</button>
                    </div>
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
              <div class="ghost-icon">⚡</div>
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

<style>
  .page { min-height: calc(100svh - 24px); display: grid; gap: 10px; }
  .panel { padding: 12px; display: grid; gap: 10px; }

  .top { display: flex; align-items: center; gap: 8px; }
  h2 { margin: 0; font-size: 1rem; }
  h3 { margin: 0; font-size: 13px; }
  .name-wrap { flex: 1; min-width: 240px; }
  .name-wrap label span { display: block; margin-bottom: 4px; color: var(--muted); font-size: 11px; text-transform: lowercase; }
  .name-wrap input {
    width: 100%;
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 10px;
    background: rgba(20,24,32,.72);
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
    background: rgba(20,24,32,.65);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
  }

  .tools-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 2px 0 4px; }
  .tools-head p { margin: 3px 0 0; color: var(--muted); font-size: 12px; }
  .cta { padding: 7px 11px; border-color: rgba(249,115,22,.5); background: rgba(249,115,22,.2); cursor: pointer; }

  .profile-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .profile { padding: 6px 10px; border-color: rgba(249,115,22,.3); background: rgba(25,30,40,.7); cursor: pointer; font-size: 12px; }
  .profile.active { border-color: rgba(249,115,22,.58); background: rgba(249,115,22,.24); }

  .search { min-height: 42px; padding: 7px 10px; display: flex; align-items: center; gap: 8px; border: 1.5px solid rgba(249,115,22,.28); border-radius: 12px; background: rgba(20,24,32,.72); min-width: 280px; }
  .search-icon { color: var(--muted); font-size: 15px; }
  .search input { width: 100%; border: 0; outline: none; background: transparent; color: var(--fg); font-size: 14px; }

  .toolbelt-layout { display: grid; gap: 10px; grid-template-columns: 220px 1fr; }

  .catalog-nav, .catalog, .equipped-zone {
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 14px;
    background: rgba(16,20,28,.46);
    padding: 10px;
    display: grid;
    gap: 8px;
    min-height: 280px;
  }

  .catalog-nav { align-content: start; gap: 10px; background: rgba(7,10,16,.9); border-color: rgba(148,163,184,.2); }
  .category-list { display: grid; gap: 7px; }
  .category-pill { display: flex; justify-content: space-between; align-items: center; padding: 7px 10px; border-color: rgba(255,255,255,.16); background: rgba(16,20,28,.66); cursor: pointer; font-size: 12px; }
  .category-pill small { color: var(--muted); font-size: 10px; }
  .category-pill.active { border-color: rgba(249,115,22,.6); background: rgba(249,115,22,.2); box-shadow: inset 3px 0 0 rgba(249,115,22,.92); }
  .category-pill.disabled { opacity: .45; cursor: not-allowed; border-style: dashed; }

  .catalog-head { display: grid; grid-template-columns: auto minmax(260px, 420px); align-items: center; justify-content: space-between; gap: 8px; }

  .equipped-zone.drag-active {
    border-color: rgba(249,115,22,.7);
    border-style: dashed;
    box-shadow: inset 0 0 0 1px rgba(249,115,22,.35), 0 0 0 8px rgba(249,115,22,.08);
    background: rgba(42,31,24,.52);
  }

  .tool-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); align-content: start; }
  .tool-item {
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 12px;
    background: rgba(16,20,28,.72);
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
    background: rgba(25,30,40,.72);
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
    opacity: 0;
    pointer-events: none;
    transition: opacity .14s ease;
  }
  .tool-item:hover .mini { opacity: 1; pointer-events: auto; }

  .equipped-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .equipped-dock { margin-top: 6px; border-style: dashed; border-color: rgba(249,115,22,.34); background: linear-gradient(180deg, rgba(16,20,28,.74), rgba(12,16,23,.82)); backdrop-filter: blur(12px); position: sticky; bottom: 10px; z-index: 4; box-shadow: 0 10px 28px rgba(0,0,0,.35); }
  .equipped-dock.compact { min-height: 92px; }
  .equipped-dock.hover-glow { border-color: rgba(249,115,22,.64); box-shadow: 0 0 0 6px rgba(249,115,22,.08); }
  .count { padding: 4px 8px; font-size: 11px; border-color: rgba(249,115,22,.35); background: rgba(25,30,40,.7); }
  .empty-state { min-height: 58px; border: 1px dashed rgba(148,163,184,.26); border-radius: 12px; background: rgba(15,23,42,.32); display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 10px; text-align: left; padding: 12px; color: #cbd5e1; }
  .ghost-icon { width: 28px; height: 28px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid rgba(249,115,22,.34); background: rgba(249,115,22,.16); font-size: 13px; }
  .empty-state p { margin: 0; font-size: 13px; color: var(--muted); }

  .equipped-list { display: grid; gap: 7px; }
  .equipped-list.horizontal { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
  .equipped-item {
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 12px;
    background: rgba(16,20,28,.72);
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
    border: 1px solid rgba(212, 212, 216, 0.25);
    color: #d4d4d8;
    background: rgba(212, 212, 216, 0.1);
    text-transform: lowercase;
  }

  .err { margin: 0; color: #fecdd3; }

  .green { color: #10b981; background: rgba(16, 185, 129, 0.14); border-color: rgba(16, 185, 129, 0.3); }
  .red { color: #fb7185; background: rgba(251, 113, 133, 0.14); border-color: rgba(251, 113, 133, 0.3); }
  .orange { color: #fb923c; background: rgba(251, 146, 60, 0.14); border-color: rgba(251, 146, 60, 0.3); }
  .zinc { color: #d4d4d8; background: rgba(212, 212, 216, 0.1); border-color: rgba(212, 212, 216, 0.22); }

  @media (max-width: 1050px) {
    .toolbelt-layout { grid-template-columns: 1fr; }
    .search { min-width: 220px; width: 100%; }
    .equipped-item { min-width: 220px; }
    .catalog-head { grid-template-columns: 1fr; }
    .equipped-dock { position: static; }
  }
</style>
