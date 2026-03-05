<script>
  import { onMount } from 'svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { loadJson } from '@/lib/api';

  const STORAGE_KEY = 'mayple_firewall_objects_v2';
  const SELECTED_KEY = 'mayple_firewall_selected_object';

  let objects = [];
  let selectedObjectId = '';
  let agents = [];

  let entityName = '';
  let folderName = '';
  let policyText = '';
  let scope = 'global';
  let selectedAgentId = '';

  let snippetName = '';
  let snippetContent = '';
  let simulatorPrompt = '';
  let simulatorResult = null;
  let revisionText = '';
  let consoleTab = 'simulator';
  let libraryView = 'active';
  let detailDragActive = false;
  let scanPulse = false;

  $: selectedObject = objects.find((item) => item.id === selectedObjectId && item.archived === (libraryView === 'archived')) || null;
  $: agentOptions = Array.isArray(agents) ? agents.map((item) => ({ id: String(item.agentId || item.id), name: item.name || String(item.id) })) : [];
  $: if (scope === 'agent' && !agentOptions.find((item) => item.id === selectedAgentId)) {
    selectedAgentId = agentOptions[0]?.id || '';
  }
  $: scopedAgentName = scope === 'agent' ? (agentOptions.find((item) => item.id === selectedAgentId)?.name || 'Unassigned Agent') : '';
  $: visibleObjects = objects.filter((item) => item.archived === (libraryView === 'archived'));
  $: folderGroups = Object.entries(
    visibleObjects.reduce((acc, item) => {
      const folder = item.folder || 'root';
      if (!acc[folder]) acc[folder] = [];
      acc[folder].push(item);
      return acc;
    }, {})
  );
  $: if (visibleObjects.length > 0 && !visibleObjects.find((item) => item.id === selectedObjectId)) {
    selectedObjectId = visibleObjects[0].id;
  }

  onMount(async () => {
    readStorage();
    try {
      const payload = await loadJson('/api/agents').catch(() => ({ items: [] }));
      agents = payload?.items || payload || [];
      if (scope === 'agent' && !selectedAgentId) {
        selectedAgentId = agentOptions[0]?.id || '';
      }
    } catch {
      agents = [];
    }
  });

  function readStorage() {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      objects = Array.isArray(parsed) ? parsed.map(normalizeObject) : [];
    } catch {
      objects = [];
    }

    selectedObjectId = window.localStorage.getItem(SELECTED_KEY) || '';
    if (!objects.find((item) => item.id === selectedObjectId)) {
      selectedObjectId = objects[0]?.id || '';
    }
  }

  function normalizeObject(item) {
    const next = { ...item };
    next.entries = Array.isArray(item.entries) ? item.entries : [];
    next.auditLog = Array.isArray(item.auditLog) ? item.auditLog : [];
    next.scope = item.scope === 'agent' ? 'agent' : 'global';
    next.rulesCount = Number.isFinite(Number(item.rulesCount)) ? Number(item.rulesCount) : inferRulesCount(item.policyText || '');
    next.blockedAttempts = Number.isFinite(Number(item.blockedAttempts)) ? Number(item.blockedAttempts) : 0;
    next.status = item.status || 'active';
    next.folder = item.folder || 'root';
    next.archived = Boolean(item.archived);
    next.policyVersions = Array.isArray(item.policyVersions) ? item.policyVersions : [{ id: `ver-seed-${item.id || Date.now()}`, timestamp: item.createdAt || nowIso(), text: item.policyText || '', actor: 'system' }];
    next.blockedPackets = Array.isArray(item.blockedPackets) ? item.blockedPackets : [];
    next.lastEvaluatedAt = item.lastEvaluatedAt || null;
    return next;
  }

  function persist(nextObjects = objects, nextSelected = selectedObjectId) {
    objects = nextObjects.map(normalizeObject);
    selectedObjectId = nextSelected;
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(objects));
    window.localStorage.setItem(SELECTED_KEY, selectedObjectId || '');
  }

  function inferRulesCount(text) {
    const lines = String(text || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    return Math.max(1, lines.length || 1);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function addAudit(objectId, message, level = 'info') {
    const next = objects.map((item) =>
      item.id === objectId
        ? {
            ...item,
            lastEvaluatedAt: nowIso(),
            auditLog: [
              { id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: nowIso(), level, message },
              ...(item.auditLog || []),
            ].slice(0, 50),
          }
        : item
    );
    persist(next, objectId);
  }

  function triggerScanPulse() {
    scanPulse = true;
    setTimeout(() => {
      scanPulse = false;
    }, 850);
  }

  function activateFirewall() {
    const name = entityName.trim();
    const folder = folderName.trim() || 'root';
    const policy = policyText.trim();
    if (!name || !policy) return;

    const newObject = normalizeObject({
      id: `fw-${Date.now()}`,
      name,
      folder,
      policyText: policy,
      scope,
      assignedAgentId: scope === 'agent' ? selectedAgentId || null : null,
      status: 'active',
      rulesCount: inferRulesCount(policy),
      blockedAttempts: 0,
      entries: [],
      createdAt: nowIso(),
      lastEvaluatedAt: nowIso(),
      policyVersions: [{ id: `ver-${Date.now()}`, timestamp: nowIso(), text: policy, actor: 'creator' }],
      blockedPackets: [],
      auditLog: [
        {
          id: `audit-${Date.now()}`,
          timestamp: nowIso(),
          level: 'safe',
          message: `Firewall activated for "${name}".`,
        },
      ],
    });

    const next = [newObject, ...objects];
    persist(next, newObject.id);
    triggerScanPulse();

    entityName = '';
    folderName = '';
    policyText = '';
    scope = 'global';
    selectedAgentId = '';
  }

  function removeObject(objectId) {
    const next = objects.map((item) => (item.id === objectId ? { ...item, archived: true } : item));
    const remainingVisible = next.filter((item) => item.archived === (libraryView === 'archived') && item.id !== objectId);
    const nextSelected = selectedObjectId === objectId ? remainingVisible[0]?.id || '' : selectedObjectId;
    persist(next, nextSelected);
    simulatorResult = null;
  }

  function restoreObject(objectId) {
    const next = objects.map((item) => (item.id === objectId ? { ...item, archived: false } : item));
    persist(next, objectId);
  }

  function selectObject(objectId) {
    selectedObjectId = objectId;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SELECTED_KEY, selectedObjectId || '');
    }
    simulatorResult = null;
  }

  function formatBytes(value) {
    if (!Number.isFinite(Number(value))) return '--';
    const bytes = Number(value);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatTime(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString();
  }

  function addFilesToObject(objectId, fileList) {
    if (!fileList || fileList.length === 0) return;
    const mapped = Array.from(fileList).map((file) => ({
      id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: 'file',
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      addedAt: nowIso(),
    }));

    const next = objects.map((item) =>
      item.id === objectId
        ? { ...item, entries: [...mapped, ...(item.entries || [])] }
        : item
    );
    persist(next, objectId);
    addAudit(objectId, `Scanned ${mapped.length} uploaded reference file(s).`, 'safe');
    triggerScanPulse();
  }

  function detailDrop(event) {
    event.preventDefault();
    detailDragActive = false;
    if (!selectedObject) return;
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    addFilesToObject(selectedObject.id, files);
  }

  function addSnippet() {
    if (!selectedObject || !snippetContent.trim()) return;
    const content = snippetContent.trim();
    const entry = {
      id: `entry-${Date.now()}`,
      kind: 'text',
      name: snippetName.trim() || `policy-context-${new Date().toISOString().slice(11, 19).replaceAll(':', '')}.txt`,
      mimeType: 'text/plain',
      sizeBytes: new Blob([content]).size,
      preview: content.slice(0, 320),
      addedAt: nowIso(),
    };
    const next = objects.map((item) =>
      item.id === selectedObject.id
        ? { ...item, entries: [entry, ...(item.entries || [])] }
        : item
    );
    persist(next, selectedObject.id);
    addAudit(selectedObject.id, `Policy context snippet "${entry.name}" added.`, 'safe');
    triggerScanPulse();
    snippetName = '';
    snippetContent = '';
  }

  function removeEntry(objectId, entryId) {
    const next = objects.map((item) =>
      item.id === objectId
        ? { ...item, entries: (item.entries || []).filter((entry) => entry.id !== entryId) }
        : item
    );
    persist(next, objectId);
  }

  function runSimulation() {
    if (!selectedObject || !simulatorPrompt.trim()) return;
    const prompt = simulatorPrompt.trim().toLowerCase();
    const policy = String(selectedObject.policyText || '').toLowerCase();
    const patterns = [
      { key: 'ssn', label: 'Social Security numbers' },
      { key: 'api key', label: 'API keys' },
      { key: 'secret', label: 'Secrets' },
      { key: 'token', label: 'Tokens' },
      { key: 'internal', label: 'Internal data' },
      { key: 'payroll', label: 'Payroll records' },
      { key: 'slack', label: 'External destination: Slack' },
      { key: 'email', label: 'External destination: Email' },
    ];

    let matchedRule = '';
    for (const pattern of patterns) {
      if ((prompt.includes(pattern.key) && policy.includes(pattern.key)) || (policy.includes('never') && prompt.includes(pattern.key))) {
        matchedRule = pattern.label;
        break;
      }
    }

    const blocked = Boolean(matchedRule);
    simulatorResult = {
      blocked,
      reason: blocked
        ? `Blocked by policy rule: ${matchedRule}`
        : 'No blocking rule matched. Prompt considered safe.',
      at: nowIso(),
    };

    const next = objects.map((item) =>
      item.id === selectedObject.id
        ? {
            ...item,
            blockedAttempts: blocked ? (Number(item.blockedAttempts || 0) + 1) : Number(item.blockedAttempts || 0),
            status: blocked ? (Number(item.blockedAttempts || 0) >= 3 ? 'active_block' : 'review_needed') : 'monitoring',
            lastEvaluatedAt: nowIso(),
            blockedPackets: blocked
              ? [
                  {
                    id: `pkt-${Date.now()}`,
                    timestamp: nowIso(),
                    destination: prompt.includes('slack') ? 'Slack' : prompt.includes('email') ? 'Email' : 'External',
                    snippet: simulatorPrompt.trim().slice(0, 180),
                    reason: matchedRule || 'Policy match',
                  },
                  ...(item.blockedPackets || []),
                ].slice(0, 50)
              : item.blockedPackets || [],
            auditLog: [
              {
                id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                timestamp: nowIso(),
                level: blocked ? 'warn' : 'safe',
                message: blocked
                  ? `Blocked simulation prompt (${matchedRule}).`
                  : 'Simulation prompt passed policy checks.',
              },
              ...(item.auditLog || []),
            ].slice(0, 50),
          }
        : item
    );
    persist(next, selectedObject.id);
  }

  function statusTone(item) {
    if (item.status === 'active_block' || Number(item.blockedAttempts || 0) >= 3) return 'status-red';
    if (item.status === 'review_needed' || Number(item.blockedAttempts || 0) > 0) return 'status-amber';
    return 'status-green';
  }

  function statusLabel(item) {
    if (item.status === 'active_block' || Number(item.blockedAttempts || 0) >= 3) return 'Active Block';
    if (item.status === 'review_needed' || Number(item.blockedAttempts || 0) > 0) return 'Review Needed';
    return 'Monitoring';
  }

  function computeDiff(currentText, previousText) {
    const prev = new Set(String(previousText || '').toLowerCase().split(/\W+/).filter(Boolean));
    const next = new Set(String(currentText || '').toLowerCase().split(/\W+/).filter(Boolean));
    const added = [...next].filter((token) => !prev.has(token)).slice(0, 12);
    const removed = [...prev].filter((token) => !next.has(token)).slice(0, 12);
    return { added, removed };
  }

  function savePolicyRevision() {
    if (!selectedObject || !revisionText.trim()) return;
    const newText = revisionText.trim();
    const oldText = String(selectedObject.policyText || '');
    const { added, removed } = computeDiff(newText, oldText);

    const next = objects.map((item) =>
      item.id === selectedObject.id
        ? {
            ...item,
            policyText: newText,
            rulesCount: inferRulesCount(newText),
            policyVersions: [
              {
                id: `ver-${Date.now()}`,
                timestamp: nowIso(),
                text: newText,
                actor: 'editor',
                diff: { added, removed },
              },
              ...(item.policyVersions || []),
            ].slice(0, 20),
            auditLog: [
              {
                id: `audit-${Date.now()}`,
                timestamp: nowIso(),
                level: 'safe',
                message: `Policy revision saved (${added.length} added token(s), ${removed.length} removed token(s)).`,
              },
              ...(item.auditLog || []),
            ].slice(0, 50),
          }
        : item
    );
    persist(next, selectedObject.id);
    triggerScanPulse();
    revisionText = '';
  }
</script>

<AppShell>
  <section class="page">
    <section class="card definition-zone" class:scan={scanPulse}>
      <div class="zone-head">
        <h1>Firewall Definition Zone</h1>
        <div class="scope-toggle">
          <button class="pill scope-pill" class:active={scope === 'global'} on:click={() => (scope = 'global')}>Global Policy</button>
          <button class="pill scope-pill" class:active={scope === 'agent'} on:click={() => (scope = 'agent')}>Assign to Agent</button>
        </div>
      </div>

      <div class="definition-grid">
        <label>
          <span>Entity Name</span>
          <input bind:value={entityName} placeholder="payroll.csv or Internal_Project_X" />
        </label>

        <label>
          <span>Folder</span>
          <input bind:value={folderName} placeholder="HR, Finance, Legal (default: root)" />
        </label>

        {#if scope === 'agent'}
          <label>
            <span>Agent Target</span>
            <select bind:value={selectedAgentId}>
              {#if agentOptions.length === 0}
                <option value="">No agents available</option>
              {:else}
                {#each agentOptions as option}
                  <option value={option.id}>{option.name}</option>
                {/each}
              {/if}
            </select>
          </label>
          <div class="agent-breadcrumb">
            <span>Bound Agent:</span>
            <span class="agent-chip">{scopedAgentName || 'Unassigned'}</span>
          </div>
        {/if}

        <label class="full">
          <span>Context / Natural Language Policy</span>
          <textarea
            class="terminal-policy"
            rows="4"
            bind:value={policyText}
            placeholder="Define what should never leave this object... (example: Never allow Social Security numbers or internal API keys to be sent to Slack)."
          ></textarea>
        </label>
      </div>

      <div class="zone-actions">
        <button class="pill cta" on:click={activateFirewall} disabled={!entityName.trim() || !policyText.trim() || (scope === 'agent' && !selectedAgentId)}>
          Activate Firewall
        </button>
      </div>
    </section>

    <div class="workspace">
      <aside class="card explorer">
        <div class="explorer-head">
          <h2>Policy Library</h2>
          <div class="explorer-actions">
            <button class="pill ghost" class:active={libraryView === 'active'} on:click={() => (libraryView = 'active')}>Current</button>
            <button class="pill ghost" class:active={libraryView === 'archived'} on:click={() => (libraryView = 'archived')}>🕒 History</button>
            <span class="pill count">{visibleObjects.length}</span>
          </div>
        </div>
        {#if visibleObjects.length === 0}
          <p class="muted">{libraryView === 'archived' ? 'No archived firewalls.' : 'No firewalls yet. Activate one above.'}</p>
        {:else}
          <div class="tree">
            {#each folderGroups as [folder, items]}
              <section class="folder-group">
                <div class="folder-head">
                  <span class="folder-name">📁 {folder}</span>
                  <span class="muted">{items.length}</span>
                </div>
                {#each items as item}
                  <article class="tree-item {statusTone(item)}" class:active={selectedObjectId === item.id}>
                    <div class="tree-top">
                      <button class="open-item" on:click={() => selectObject(item.id)}>
                        <span class="shield">🛡</span>
                        <span>{item.name}</span>
                      </button>
                      {#if libraryView === 'archived'}
                        <button class="pill" on:click={() => restoreObject(item.id)}>Restore</button>
                      {:else}
                        <button class="pill danger" on:click={() => removeObject(item.id)}>Archive</button>
                      {/if}
                    </div>
                    <div class="tree-meta-row">
                      <span class="scope-tag" class:agent={item.scope === 'agent'}>
                        {item.scope === 'agent' ? `Agent-Specific` : 'Global'}
                      </span>
                      <span class="metric">{item.rulesCount || 0} rules</span>
                      <span class="metric warn">{item.blockedAttempts || 0} blocked</span>
                      <span class="metric">{statusLabel(item)}</span>
                    </div>
                    <p class="meta">Last eval: {formatTime(item.lastEvaluatedAt)}</p>
                  </article>
                {/each}
              </section>
            {/each}
          </div>
        {/if}
      </aside>

      <section class="card console" class:scan={scanPulse}>
        {#if !selectedObject}
          <div class="empty-console">
            <p>Select a policy object to open the management console.</p>
          </div>
        {:else}
          <div class="console-head">
            <h2>Policy Console: /{selectedObject.name}</h2>
            <span class="pill scope-mini">{selectedObject.scope === 'agent' ? 'Agent-Specific' : 'Global'}</span>
          </div>

          <div class="console-tabs">
            <button class="pill ghost" class:active={consoleTab === 'simulator'} on:click={() => (consoleTab = 'simulator')}>Test Packet</button>
            <button class="pill ghost" class:active={consoleTab === 'evolution'} on:click={() => (consoleTab = 'evolution')}>Policy Evolution</button>
            <button class="pill ghost" class:active={consoleTab === 'blocked'} on:click={() => (consoleTab = 'blocked')}>Blocked Packets</button>
          </div>

          <div
            class="dropzone"
            role="region"
            aria-label="Upload reference files"
            class:active={detailDragActive}
            on:dragover={(event) => {
              event.preventDefault();
              detailDragActive = true;
            }}
            on:dragleave={() => (detailDragActive = false)}
            on:drop={detailDrop}
          >
            <p>Upload reference files for AI context</p>
          </div>

          {#if consoleTab === 'simulator'}
            <div class="simulator card-lite">
              <div class="sim-head">
                <h3>Policy Simulator</h3>
              </div>
              <textarea rows="3" bind:value={simulatorPrompt} placeholder="Paste a test packet/prompt to validate this firewall..."></textarea>
              <button class="pill" on:click={runSimulation} disabled={!simulatorPrompt.trim()}>Run Simulation</button>
              {#if simulatorResult}
                <p class:warn={simulatorResult.blocked} class:safe={!simulatorResult.blocked}>
                  {simulatorResult.blocked ? 'Blocked' : 'Allowed'}: {simulatorResult.reason}
                </p>
              {/if}
            </div>
          {:else if consoleTab === 'evolution'}
            <div class="card-lite evolution">
              <h3>Policy Evolution</h3>
              <textarea rows="3" bind:value={revisionText} placeholder="Update policy text to create a new revision..."></textarea>
              <button class="pill" on:click={savePolicyRevision} disabled={!revisionText.trim()}>Save Revision</button>
              <div class="version-list">
                {#each selectedObject.policyVersions || [] as version, index}
                  <article class="version-item">
                    <p class="meta">v{(selectedObject.policyVersions || []).length - index} · {formatTime(version.timestamp)} · {version.actor || 'editor'}</p>
                    <pre>{version.text}</pre>
                    {#if version.diff}
                      <div class="diff">
                        <p class="safe">+ {version.diff.added?.join(', ') || 'none'}</p>
                        <p class="warn">- {version.diff.removed?.join(', ') || 'none'}</p>
                      </div>
                    {/if}
                  </article>
                {/each}
              </div>
            </div>
          {:else}
            <div class="card-lite blocked-feed">
              <h3>Blocked Packets</h3>
              {#if (selectedObject.blockedPackets || []).length === 0}
                <p class="muted">No blocked packets yet.</p>
              {:else}
                <div class="packet-list">
                  {#each selectedObject.blockedPackets as pkt}
                    <article class="packet-item warn">
                      <p><strong>{pkt.destination}</strong> · {pkt.reason}</p>
                      <small>{formatTime(pkt.timestamp)}</small>
                      <pre>{pkt.snippet}</pre>
                    </article>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <div class="snippet card-lite">
            <h3>Add Inline Context</h3>
            <input bind:value={snippetName} placeholder="Snippet file name (optional)" />
            <textarea rows="3" bind:value={snippetContent} placeholder="Paste policy context, examples, or structured data..."></textarea>
            <button class="pill" on:click={addSnippet} disabled={!snippetContent.trim()}>Attach Snippet</button>
          </div>

          <div class="panel-grid">
            <section class="entries card-lite">
              <div class="section-head">
                <h3>Reference Filesystem</h3>
                <span class="muted">{(selectedObject.entries || []).length} entries</span>
              </div>
              {#if (selectedObject.entries || []).length === 0}
                <p class="muted">No files/snippets attached yet.</p>
              {:else}
                <div class="entry-list">
                  {#each selectedObject.entries as entry}
                    <article class="entry">
                      <div>
                        <p class="entry-name">{entry.name}</p>
                        <p class="meta">{entry.mimeType} · {formatBytes(entry.sizeBytes)}</p>
                      </div>
                      <button class="pill danger" on:click={() => removeEntry(selectedObject.id, entry.id)}>Remove</button>
                    </article>
                  {/each}
                </div>
              {/if}
            </section>

            <section class="audit card-lite">
              <div class="section-head">
                <h3>Live Feed / Audit Log</h3>
                <span class="muted">{(selectedObject.auditLog || []).length} events</span>
              </div>
              {#if (selectedObject.auditLog || []).length === 0}
                <p class="muted">No evaluations yet.</p>
              {:else}
                <div class="audit-list">
                  {#each selectedObject.auditLog as event}
                    <article class="audit-item" class:warn={event.level === 'warn'} class:safe={event.level === 'safe'}>
                      <p>{event.message}</p>
                      <small>{formatTime(event.timestamp)}</small>
                    </article>
                  {/each}
                </div>
              {/if}
            </section>
          </div>
        {/if}
      </section>
    </div>
  </section>
</AppShell>

<style>
  .page { min-height: calc(100svh - 24px); display: grid; gap: 10px; }
  h1,h2,h3,p { margin: 0; }
  .muted { color: var(--muted); font-size: 12px; }

  .definition-zone {
    position: relative;
    overflow: hidden;
    padding: 12px;
    display: grid;
    gap: 10px;
  }
  .definition-zone.scan::after,
  .console.scan::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(249,115,22,.34), transparent);
    transform: translateX(-100%);
    animation: scanline .8s ease;
    pointer-events: none;
  }
  @keyframes scanline {
    to { transform: translateX(100%); }
  }

  .zone-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .scope-toggle { display: flex; gap: 8px; }
  .scope-pill { padding: 6px 10px; cursor: pointer; border-color: rgba(148,163,184,.3); background: rgba(20,24,32,.66); }
  .scope-pill.active { border-color: rgba(249,115,22,.6); background: rgba(249,115,22,.22); }
  .agent-breadcrumb { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); }
  .agent-chip { border: 1px solid rgba(16,185,129,.35); background: rgba(16,185,129,.14); color: #6ee7b7; border-radius: 999px; padding: 3px 8px; }

  .definition-grid { display: grid; gap: 8px; grid-template-columns: minmax(240px, 1fr) minmax(220px, 320px); }
  .definition-grid .full { grid-column: 1 / -1; }
  label span { display: block; margin-bottom: 4px; color: var(--muted); font-size: 11px; }
  input,select,textarea {
    width: 100%;
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 11px;
    background: rgba(20,24,32,.72);
    color: var(--fg);
    padding: 8px 10px;
    outline: none;
  }
  textarea { resize: vertical; }
  .terminal-policy {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    background-image: repeating-linear-gradient(180deg, rgba(255,255,255,.03) 0 1px, transparent 1px 22px);
    border-color: rgba(249,115,22,.35);
  }
  .zone-actions { display: flex; justify-content: flex-end; }
  .cta { padding: 8px 12px; border-color: rgba(249,115,22,.6); background: rgba(249,115,22,.22); cursor: pointer; }

  .workspace { min-height: 0; display: grid; gap: 10px; grid-template-columns: 360px 1fr; }
  .explorer, .console { position: relative; overflow: hidden; padding: 12px; display: grid; gap: 10px; align-content: start; }

  .explorer-head, .console-head, .section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .count, .scope-mini { padding: 4px 8px; font-size: 11px; border-color: rgba(16,185,129,.3); background: rgba(16,185,129,.12); }
  .explorer-actions { display: flex; align-items: center; gap: 6px; }
  .ghost { padding: 4px 8px; font-size: 11px; border-color: rgba(148,163,184,.3); background: rgba(20,24,32,.62); cursor: pointer; }
  .ghost.active { border-color: rgba(249,115,22,.55); background: rgba(249,115,22,.18); color: #fed7aa; }

  .tree { display: grid; gap: 8px; max-height: calc(100svh - 270px); overflow: auto; padding-right: 2px; }
  .folder-group { display: grid; gap: 7px; }
  .folder-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 2px 0; }
  .folder-name { font-size: 11px; color: #cbd5e1; letter-spacing: .03em; }
  .tree-item {
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 12px;
    background: rgba(14,18,25,.56);
    border-left-width: 3px;
    padding: 9px;
    display: grid;
    gap: 6px;
  }
  .tree-item.status-green { border-left-color: #10b981; box-shadow: inset 0 0 0 1px rgba(16,185,129,.1); }
  .tree-item.status-amber { border-left-color: #f59e0b; box-shadow: inset 0 0 0 1px rgba(245,158,11,.1); }
  .tree-item.status-red { border-left-color: #fb7185; box-shadow: inset 0 0 0 1px rgba(251,113,133,.14); }
  .tree-item.active { border-color: rgba(249,115,22,.55); box-shadow: inset 0 0 0 1px rgba(249,115,22,.2); }
  .tree-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .open-item {
    border: 0;
    background: transparent;
    color: inherit;
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
  }
  .shield { color: #10b981; }
  .tree-meta-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .scope-tag, .metric {
    font-size: 10px;
    border-radius: 999px;
    padding: 2px 7px;
    border: 1px solid rgba(148,163,184,.28);
    color: #cbd5e1;
    background: rgba(15,23,42,.32);
  }
  .scope-tag.agent { border-color: rgba(249,115,22,.36); background: rgba(249,115,22,.12); color: #fdba74; }
  .metric.warn { border-color: rgba(251,191,36,.36); background: rgba(251,191,36,.12); color: #fcd34d; }
  .meta { color: var(--muted); font-size: 11px; }

  .card-lite { border: 1px solid rgba(255,255,255,.08); border-radius: 12px; background: rgba(14,18,25,.48); padding: 10px; display: grid; gap: 8px; }
  .dropzone {
    border: 1px dashed rgba(249,115,22,.45);
    border-radius: 12px;
    background: rgba(24,18,12,.3);
    min-height: 86px;
    display: grid;
    place-items: center;
    text-align: center;
    padding: 10px;
  }
  .dropzone.active { border-color: rgba(249,115,22,.8); box-shadow: 0 0 0 7px rgba(249,115,22,.1); background: rgba(37,22,12,.45); }
  .dropzone p { color: #e2e8f0; font-size: 13px; }

  .sim-head { display: flex; align-items: center; justify-content: space-between; }
  .simulator .pill, .snippet .pill { width: fit-content; padding: 7px 10px; cursor: pointer; }
  .console-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
  .warn { color: #f59e0b; }
  .safe { color: #10b981; }
  .evolution .version-list, .blocked-feed .packet-list { display: grid; gap: 8px; max-height: 230px; overflow: auto; padding-right: 2px; }
  .version-item, .packet-item { border: 1px solid rgba(255,255,255,.1); border-radius: 10px; background: rgba(16,20,28,.7); padding: 8px; display: grid; gap: 6px; }
  .version-item pre, .packet-item pre { margin: 0; border-radius: 8px; background: rgba(11,14,20,.9); border: 1px solid rgba(148,163,184,.2); color: #cbd5e1; font-size: 11px; padding: 8px; max-height: 120px; overflow: auto; white-space: pre-wrap; }
  .version-item .diff { display: grid; gap: 4px; }
  .packet-item small { color: var(--muted); font-size: 10px; }

  .panel-grid { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
  .entry-list, .audit-list { display: grid; gap: 8px; max-height: 260px; overflow: auto; padding-right: 2px; }
  .entry, .audit-item {
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 10px;
    background: rgba(16,20,28,.72);
    padding: 8px;
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 8px;
  }
  .entry-name { font-size: 13px; font-weight: 600; }
  .audit-item { display: grid; gap: 4px; }
  .audit-item.warn { border-color: rgba(251,191,36,.42); background: rgba(251,191,36,.1); }
  .audit-item.safe { border-color: rgba(16,185,129,.34); background: rgba(16,185,129,.1); }
  .audit-item small { color: var(--muted); font-size: 10px; }

  .danger { padding: 5px 8px; font-size: 11px; border-color: rgba(251,113,133,.4); background: rgba(251,113,133,.16); cursor: pointer; }
  .empty-console {
    min-height: 320px;
    border: 1px dashed rgba(148,163,184,.26);
    border-radius: 12px;
    display: grid;
    place-items: center;
    color: var(--muted);
  }

  @media (max-width: 1260px) {
    .workspace { grid-template-columns: 1fr; }
    .panel-grid { grid-template-columns: 1fr; }
    .tree { max-height: 260px; }
  }
  @media (max-width: 900px) {
    .definition-grid { grid-template-columns: 1fr; }
  }
</style>
