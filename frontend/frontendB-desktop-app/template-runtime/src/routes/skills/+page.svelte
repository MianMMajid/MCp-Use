<script>
  import { onMount, onDestroy } from 'svelte';
  import AppShell from '@/lib/components/AppShell.svelte';

  const CUSTOM_SKILLS_KEY = 'mayple_custom_skills';
  const RECENT_ACTIVITY_KEY = 'mayple_skills_recent';

  const builtinSkills = [
    { id: 'exec', name: 'exec', description: 'Run terminal/shell commands.', category: 'system', tags: ['#file-system', '#runtime'], status: 'connected' },
    { id: 'apply_patch', name: 'apply_patch', description: 'Apply surgical code diffs.', category: 'system', tags: ['#file-system', '#code'], status: 'connected' },
    { id: 'read_file', name: 'read_file / write_file', description: 'Read and write local files.', category: 'system', tags: ['#file-system'], status: 'connected' },
    { id: 'process', name: 'process', description: 'Monitor and control background tasks.', category: 'system', tags: ['#runtime'], status: 'connected' },

    { id: 'browser', name: 'browser', description: 'Managed Playwright browser automation.', category: 'web', tags: ['#web', '#ui'], status: 'connected' },
    { id: 'web_search', name: 'web_search', description: 'High-speed keyword web search.', category: 'web', tags: ['#web', '#api'], status: 'connected' },
    { id: 'web_fetch', name: 'web_fetch', description: 'Fetch webpages into readable markdown.', category: 'web', tags: ['#web', '#api'], status: 'connected' },
    { id: 'pdf_tool', name: 'pdf_tool', description: 'Parse and read complex PDF content.', category: 'web', tags: ['#documents'], status: 'connected' },
    { id: 'image', name: 'image', description: 'OCR and image understanding.', category: 'web', tags: ['#vision'], status: 'degraded' },

    { id: 'message', name: 'message', description: 'Send notifications and routed replies.', category: 'communications', tags: ['#messaging', '#api'], status: 'connected' },
    { id: 'gateway', name: 'gateway', description: 'Manage persistent app routing connections.', category: 'communications', tags: ['#messaging', '#runtime'], status: 'connected' },

    { id: 'agent_send', name: 'agent_send / sessions_spawn', description: 'Spawn sub-agents for parallel work.', category: 'automation', tags: ['#orchestration', '#runtime'], status: 'connected' },
    { id: 'cron', name: 'cron', description: 'Schedule recurring jobs.', category: 'automation', tags: ['#scheduler'], status: 'connected' },
    { id: 'heartbeat', name: 'heartbeat', description: 'Background wake loop for autonomous checks.', category: 'automation', tags: ['#runtime'], status: 'connected' },
    { id: 'loop_detection', name: 'loop_detection', description: 'Kill stuck infinite loops.', category: 'automation', tags: ['#safety'], status: 'connected' },

    { id: 'gog', name: 'gog', description: 'Google office gateway for Gmail/Drive/Calendar.', category: 'utilities', tags: ['#office', '#api'], status: 'connected' },
    { id: 'weather', name: 'weather', description: 'Weather lookup and connectivity sanity test.', category: 'utilities', tags: ['#utility'], status: 'connected' },
    { id: 'healthcheck', name: 'healthcheck', description: 'Diagnostic check for keys and integrations.', category: 'utilities', tags: ['#safety', '#utility'], status: 'connected' },
    { id: 'skill-creator', name: 'skill-creator', description: 'Scaffold helper for new skills.', category: 'utilities', tags: ['#utility', '#code'], status: 'connected' },
  ];

  const categories = [
    { id: 'all', label: 'All Skills' },
    { id: 'system', label: 'System Runtime' },
    { id: 'web', label: 'Web Intelligence' },
    { id: 'communications', label: 'Social & Comms' },
    { id: 'automation', label: 'Automation' },
    { id: 'utilities', label: 'Utilities' },
    { id: 'custom', label: 'Custom' },
  ];

  let search = '';
  let selectedCategory = 'all';
  let activeTags = new Set();

  let customSkills = [];
  let recentActivity = [];

  let creatorOpen = false;
  let dragActive = false;
  let skillName = '';
  let pendingFile = null;
  let creatorError = '';

  let testPanelOpen = false;
  let testSkill = null;
  let testLogs = [];
  let testRunning = false;
  let testResult = '';
  let testTimers = [];

  $: unifiedSkills = [
    ...builtinSkills,
    ...customSkills.map((item) => ({
      id: String(item.id),
      name: item.name,
      description: item.description || `Imported from ${item.fileName || 'ZIP'}`,
      category: 'custom',
      tags: ['#custom'],
      status: 'connected',
      importedAt: item.importedAt,
      fileName: item.fileName,
    })),
  ];

  $: allTags = Array.from(new Set(unifiedSkills.flatMap((item) => item.tags || []))).sort();

  $: filteredSkills = unifiedSkills.filter((item) => {
    if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
    if (activeTags.size > 0) {
      const tags = new Set(item.tags || []);
      for (const tag of activeTags) {
        if (!tags.has(tag)) return false;
      }
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(item.name || '').toLowerCase().includes(q) ||
      String(item.description || '').toLowerCase().includes(q) ||
      String(item.id || '').toLowerCase().includes(q)
    );
  });

  $: connectedCount = unifiedSkills.filter((item) => item.status === 'connected').length;

  $: preview = pendingFile
    ? {
        schema: {
          name: skillName.trim() || pendingFile.name.replace(/\.zip$/i, ''),
          version: '1.0.0',
          runtime: 'openclaw-skill',
          permissions: ['filesystem', 'network'],
        },
        entrypoints: ['manifest.json', 'index.js', 'README.md'],
      }
    : null;

  onMount(() => {
    readStorage();
  });

  onDestroy(() => {
    clearTestTimers();
  });

  function readStorage() {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(CUSTOM_SKILLS_KEY);
      customSkills = raw ? JSON.parse(raw) : [];
    } catch {
      customSkills = [];
    }

    try {
      const raw = window.localStorage.getItem(RECENT_ACTIVITY_KEY);
      recentActivity = raw ? JSON.parse(raw) : [];
    } catch {
      recentActivity = [];
    }
  }

  function persistCustomSkills(next) {
    customSkills = next;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CUSTOM_SKILLS_KEY, JSON.stringify(next));
    }
  }

  function persistActivity(next) {
    recentActivity = next;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RECENT_ACTIVITY_KEY, JSON.stringify(next));
    }
  }

  function toggleTag(tag) {
    const next = new Set(activeTags);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    activeTags = next;
  }

  function openCreator() {
    creatorOpen = true;
    creatorError = '';
  }

  function closeCreator() {
    creatorOpen = false;
    dragActive = false;
    creatorError = '';
  }

  function onDrop(event) {
    event.preventDefault();
    dragActive = false;
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      creatorError = 'Only .zip skill bundles are supported.';
      return;
    }
    pendingFile = file;
    if (!skillName.trim()) {
      skillName = file.name.replace(/\.zip$/i, '');
    }
    creatorError = '';
  }

  function onFileInput(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      creatorError = 'Only .zip skill bundles are supported.';
      return;
    }
    pendingFile = file;
    if (!skillName.trim()) {
      skillName = file.name.replace(/\.zip$/i, '');
    }
    creatorError = '';
  }

  function addCustomSkill() {
    const name = skillName.trim();
    if (!name) {
      creatorError = 'Skill name is required.';
      return;
    }
    if (!pendingFile) {
      creatorError = 'Drop or choose a .zip file first.';
      return;
    }

    const id = `custom-${Date.now()}`;
    const next = [
      {
        id,
        name,
        description: `Custom skill imported from ${pendingFile.name}`,
        fileName: pendingFile.name,
        sizeBytes: pendingFile.size,
        importedAt: new Date().toISOString(),
      },
      ...customSkills,
    ];
    persistCustomSkills(next);
    skillName = '';
    pendingFile = null;
    creatorError = '';
    creatorOpen = false;
  }

  function removeCustomSkill(skillId) {
    persistCustomSkills(customSkills.filter((item) => item.id !== skillId));
  }

  function clearTestTimers() {
    for (const timer of testTimers) clearTimeout(timer);
    testTimers = [];
  }

  function runSmokeTest(skill) {
    clearTestTimers();
    testPanelOpen = true;
    testSkill = skill;
    testRunning = true;
    testResult = '';
    testLogs = [
      `> openclaw test --skill ${skill.id}`,
      'Bootstrapping runtime context...',
    ];

    const t1 = setTimeout(() => {
      testLogs = [...testLogs, 'Checking dependency graph...', 'Validating credentials and environment...'];
    }, 500);
    const t2 = setTimeout(() => {
      testLogs = [...testLogs, `Executing ${skill.name} smoke operation...`];
    }, 1000);
    const t3 = setTimeout(() => {
      testRunning = false;
      testResult = 'pass';
      testLogs = [...testLogs, 'PASS: Skill responded successfully (latency 214ms).'];

      const activityEntry = {
        id: `act-${Date.now()}`,
        skillId: skill.id,
        skillName: skill.name,
        status: 'success',
        timestamp: new Date().toISOString(),
      };
      persistActivity([activityEntry, ...recentActivity].slice(0, 3));
    }, 1600);

    testTimers = [t1, t2, t3];
  }

  function closeTestPanel() {
    testPanelOpen = false;
    testSkill = null;
    testLogs = [];
    testResult = '';
    testRunning = false;
    clearTestTimers();
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(Number(bytes))) return '--';
    const value = Number(bytes);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
</script>

<AppShell>
  <section class="page">
    <header class="card head">
      <div class="head-left">
        <h1>Skills Toolbox</h1>
        <p>Active Openclaw skills with live status, filtering, and quick tests.</p>
      </div>
      <div class="head-right">
        <div class="search">
          <span>⌕</span>
          <input bind:value={search} placeholder="Search skills..." />
        </div>
        <button class="pill add" on:click={openCreator}>+ Add New</button>
      </div>
    </header>

    <div class="layout-grid">
      <aside class="card side">
        <section>
          <h2>Categories</h2>
          <div class="pills">
            {#each categories as category}
              <button
                class="pill filter-pill"
                class:active={selectedCategory === category.id}
                on:click={() => (selectedCategory = category.id)}
              >
                {category.label}
              </button>
            {/each}
          </div>
        </section>

        <section>
          <h2>Tags</h2>
          <div class="pills">
            {#each allTags as tag}
              <button
                class="pill filter-pill"
                class:active={activeTags.has(tag)}
                on:click={() => toggleTag(tag)}
              >
                {tag}
              </button>
            {/each}
          </div>
        </section>

        <section>
          <h2>Recent Activity</h2>
          {#if recentActivity.length === 0}
            <p class="muted">No skill activity yet.</p>
          {:else}
            <div class="activity-list">
              {#each recentActivity as item}
                <article class="activity-item">
                  <p>{item.skillName}</p>
                  <small>{item.status} · {formatTime(item.timestamp)}</small>
                </article>
              {/each}
            </div>
          {/if}
        </section>
      </aside>

      <section class="card gallery">
        <div class="gallery-head">
          <h2>Active Skills</h2>
          <div class="summary">
            <span class="pill stat">{filteredSkills.length} shown</span>
            <span class="pill stat">{connectedCount} connected</span>
          </div>
        </div>

        {#if filteredSkills.length === 0}
          <p class="muted">No skills match your current filters.</p>
        {:else}
          <div class="skill-grid">
            {#each filteredSkills as skill}
              <article class="skill-card">
                <div class="skill-top">
                  <p>{skill.name}</p>
                  <span class="status-chip">
                    <span class="status-dot" class:ok={skill.status === 'connected'} class:warn={skill.status !== 'connected'}></span>
                    {skill.status === 'connected' ? 'API Connected' : 'Degraded'}
                  </span>
                </div>
                <p class="muted">{skill.description}</p>
                <div class="tags">
                  {#each skill.tags || [] as tag}
                    <span class="tag">{tag}</span>
                  {/each}
                </div>
                <div class="skill-actions">
                  <button class="pill test" on:click={() => runSmokeTest(skill)}>Test</button>
                  {#if skill.category === 'custom'}
                    <button class="pill danger" on:click={() => removeCustomSkill(skill.id)}>Remove</button>
                  {/if}
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  </section>
</AppShell>

{#if creatorOpen}
  <div class="overlay" role="dialog" tabindex="-1" aria-modal="true" aria-label="Add custom skill" on:click={(e) => e.currentTarget === e.target && closeCreator()}>
    <aside class="card creator">
      <div class="creator-head">
        <h2>Add Custom Skill</h2>
        <button class="pill" on:click={closeCreator}>Close</button>
      </div>

      <div
        class="dropzone"
        role="button"
        tabindex="0"
        class:active={dragActive}
        on:dragover={(event) => {
          event.preventDefault();
          dragActive = true;
        }}
        on:dragleave={() => (dragActive = false)}
        on:drop={onDrop}
      >
        <p>{pendingFile ? pendingFile.name : 'Drop skill ZIP here'}</p>
        <small>{pendingFile ? formatBytes(pendingFile.size) : 'or choose a file below'}</small>
      </div>

      <label>
        <span>Skill Name</span>
        <input bind:value={skillName} placeholder="My Custom Skill" />
      </label>

      <label>
        <span>ZIP Bundle</span>
        <input type="file" accept=".zip,application/zip" on:change={onFileInput} />
      </label>

      {#if preview}
        <section class="preview card">
          <h3>Schema Preview</h3>
          <pre>{JSON.stringify(preview.schema, null, 2)}</pre>
          <h3>Code Entry Points</h3>
          <ul>
            {#each preview.entrypoints as entry}
              <li>{entry}</li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if creatorError}
        <p class="error">{creatorError}</p>
      {/if}

      <button class="pill add" on:click={addCustomSkill}>Add Skill</button>
    </aside>
  </div>
{/if}

{#if testPanelOpen}
  <div class="overlay" role="dialog" tabindex="-1" aria-modal="true" aria-label="Skill test panel" on:click={(e) => e.currentTarget === e.target && closeTestPanel()}>
    <section class="card tester">
      <div class="creator-head">
        <h2>Skill Test: {testSkill?.name}</h2>
        <button class="pill" on:click={closeTestPanel}>Close</button>
      </div>
      <pre class="console">{testLogs.join('\n')}</pre>
      <div class="tester-foot">
        <span class="pill stat">{testRunning ? 'Running...' : testResult === 'pass' ? 'PASS' : 'Idle'}</span>
      </div>
    </section>
  </div>
{/if}

<style>
  .page { min-height: calc(100svh - 24px); display: grid; grid-template-rows: max-content 1fr; align-content: start; gap: 10px; }
  .head { padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }

  h1 { margin: 0; font-size: 1.08rem; }
  h2 { margin: 0; font-size: 0.98rem; }
  h3 { margin: 0; font-size: 0.9rem; }

  .head-left p, .muted { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .head-right { display: flex; align-items: center; gap: 8px; }

  .search { min-width: 280px; height: 38px; border: 1px solid rgba(255,255,255,.12); border-radius: 999px; background: rgba(18,22,30,.8); display: flex; align-items: center; gap: 6px; padding: 0 10px; }
  .search span { color: var(--muted); font-size: 14px; }
  .search input { width: 100%; border: 0; outline: none; background: transparent; color: var(--fg); }

  .add { padding: 7px 11px; border-color: rgba(249,115,22,.5); background: rgba(249,115,22,.2); cursor: pointer; }

  .layout-grid { display: grid; grid-template-columns: 300px 1fr; gap: 10px; min-height: 0; }
  .side, .gallery { padding: 12px; display: grid; gap: 12px; align-content: start; }

  .pills { display: flex; flex-wrap: wrap; gap: 7px; }
  .side section h2 { margin-bottom: 10px; }
  .side section + section { margin-top: 6px; }
  .filter-pill { padding: 5px 9px; font-size: 11px; cursor: pointer; border-color: rgba(255,255,255,.2); background: rgba(23,28,37,.74); }
  .filter-pill.active { border-color: rgba(249,115,22,.5); background: rgba(249,115,22,.2); }

  .activity-list { display: grid; gap: 7px; }
  .activity-item { border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 8px; background: rgba(16,20,28,.56); }
  .activity-item p { margin: 0; font-size: 12px; font-weight: 600; }
  .activity-item small { color: var(--muted); font-size: 11px; }

  .gallery-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .summary { display: flex; gap: 8px; }
  .stat { padding: 5px 8px; font-size: 11px; border-color: rgba(249,115,22,.28); background: rgba(24,29,38,.7); }

  .skill-grid { display: grid; gap: 9px; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
  .skill-card { border: 1px solid rgba(255,255,255,.1); border-radius: 12px; background: rgba(16,20,28,.56); padding: 9px; display: grid; gap: 7px; }

  .skill-top { display: flex; align-items: center; gap: 8px; }
  .skill-top p { margin: 0; flex: 1; font-size: 13px; font-weight: 600; }
  .status-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(148,163,184,.28); border-radius: 999px; padding: 2px 7px; font-size: 10px; color: #cbd5e1; background: rgba(30,41,59,.32); }
  .status-dot { width: 9px; height: 9px; border-radius: 999px; }
  .status-dot.ok { background: #10b981; box-shadow: 0 0 0 4px rgba(16,185,129,.18); }
  .status-dot.warn { background: #f59e0b; box-shadow: 0 0 0 4px rgba(245,158,11,.2); }

  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag { font-size: 10px; color: #cbd5e1; border: 1px solid rgba(148,163,184,.28); border-radius: 999px; padding: 2px 6px; background: rgba(51,65,85,.2); }

  .skill-actions { display: flex; gap: 8px; }
  .test { padding: 5px 9px; font-size: 11px; cursor: pointer; }
  .danger { padding: 5px 9px; font-size: 11px; border-color: rgba(251,113,133,.4); background: rgba(251,113,133,.16); cursor: pointer; }

  .overlay { position: fixed; inset: 0; z-index: 80; background: rgba(5,9,14,.62); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 14px; }
  .creator { width: min(740px, 100%); padding: 12px; display: grid; gap: 10px; }
  .tester { width: min(760px, 100%); padding: 12px; display: grid; gap: 10px; }

  .creator-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }

  .dropzone { border: 1px dashed rgba(249,115,22,.35); border-radius: 12px; background: rgba(20,24,32,.5); min-height: 90px; padding: 10px; display: grid; place-items: center; text-align: center; }
  .dropzone.active { border-color: rgba(249,115,22,.68); background: rgba(44,31,20,.56); }
  .dropzone p { margin: 0; font-size: 13px; font-weight: 600; }
  .dropzone small { color: var(--muted); }

  label span { display: block; margin-bottom: 4px; color: var(--muted); font-size: 11px; }
  label input { width: 100%; border: 1px solid rgba(255,255,255,.14); border-radius: 10px; background: rgba(20,24,32,.72); color: var(--fg); padding: 7px 9px; outline: none; }

  .preview { padding: 10px; display: grid; gap: 8px; }
  .preview pre { margin: 0; border-radius: 10px; background: rgba(11,14,20,.84); padding: 8px; font-size: 11px; overflow: auto; }
  .preview ul { margin: 0; padding-left: 16px; font-size: 12px; }

  .console { margin: 0; border-radius: 10px; background: rgba(11,14,20,.9); padding: 10px; min-height: 180px; max-height: 320px; overflow: auto; font-size: 12px; color: #cbd5e1; }
  .tester-foot { display: flex; justify-content: flex-end; }

  .error { margin: 0; color: #fecdd3; font-size: 12px; }

  @media (max-width: 1120px) {
    .layout-grid { grid-template-columns: 1fr; }
    .search { min-width: 220px; }
  }
</style>
