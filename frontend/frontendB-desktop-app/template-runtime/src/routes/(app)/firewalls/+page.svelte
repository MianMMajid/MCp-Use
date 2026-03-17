<script>
  import { onMount } from 'svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { loadJson, postJson, patchJson, deleteJson, postForm, invalidateCache } from '@/lib/api';

  let loading = true;
  let error = '';
  let objects = [];
  let agents = [];
  let selectedObjectId = '';
  let libraryView = 'active';
  let consoleTab = 'simulator';

  let entityName = '';
  let folderName = '';
  let policyText = '';
  let scope = 'global';
  let selectedAgentId = '';

  let simulatorPrompt = '';
  let simulatorResult = null;
  let revisionText = '';
  let snippetName = '';
  let snippetContent = '';

  $: agentOptions = Array.isArray(agents)
    ? agents.map((item) => ({ id: String(item.agentId || item.id), name: item.name || String(item.id) }))
    : [];
  $: visibleObjects = objects.filter((item) => item.archived === (libraryView === 'archived'));
  $: if (!visibleObjects.find((item) => String(item.id) === String(selectedObjectId))) {
    selectedObjectId = visibleObjects[0]?.id || '';
  }
  $: selectedObject = visibleObjects.find((item) => String(item.id) === String(selectedObjectId)) || null;
  $: if (scope === 'agent' && !agentOptions.find((item) => item.id === selectedAgentId)) {
    selectedAgentId = agentOptions[0]?.id || '';
  }

  function formatTime(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString();
  }

  function formatBytes(value) {
    if (!Number.isFinite(Number(value))) return '--';
    const bytes = Number(value);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function setSelected(id) {
    selectedObjectId = id;
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('firewallId', String(id));
      window.history.replaceState({}, '', url);
    }
  }

  async function refresh() {
    loading = true;
    error = '';
    try {
      const [firewallData, agentData] = await Promise.all([
        loadJson('/api/firewalls'),
        loadJson('/api/agents').catch(() => ({ items: [] })),
      ]);
      objects = firewallData?.items || [];
      agents = agentData?.items || agentData || [];
      if (typeof window !== 'undefined') {
        const urlId = new URL(window.location.href).searchParams.get('firewallId') || '';
        if (urlId && objects.find((item) => String(item.id) === urlId)) {
          selectedObjectId = urlId;
        }
      }
      if (!selectedObjectId && objects.length > 0) {
        selectedObjectId = objects[0].id;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  onMount(refresh);

  async function activateFirewall() {
    error = '';
    try {
      const response = await postJson('/api/firewalls', {
        name: entityName,
        folder: folderName || 'root',
        scope,
        assignedAgentId: scope === 'agent' ? selectedAgentId || null : null,
        policyText,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `Failed to create firewall (${response.status})`);
      }
      entityName = '';
      folderName = '';
      policyText = '';
      scope = 'global';
      invalidateCache('/api/firewalls');
      await refresh();
      if (payload?.firewall?.id) setSelected(payload.firewall.id);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function saveMetadata() {
    if (!selectedObject) return;
    error = '';
    try {
      const response = await patchJson(`/api/firewalls/${selectedObject.id}`, {
        name: selectedObject.name,
        folder: selectedObject.folder,
        scope: selectedObject.scope,
        assignedAgentId: selectedObject.scope === 'agent' ? selectedObject.assignedAgentId : null,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `Failed to save firewall (${response.status})`);
      }
      invalidateCache('/api/firewalls');
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function saveRevision() {
    if (!selectedObject || !revisionText.trim()) return;
    error = '';
    try {
      const response = await postJson(`/api/firewalls/${selectedObject.id}/versions`, {
        policyText: revisionText,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `Failed to save revision (${response.status})`);
      }
      revisionText = '';
      invalidateCache('/api/firewalls');
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function activateVersion(versionId) {
    if (!selectedObject) return;
    error = '';
    try {
      const response = await postJson(`/api/firewalls/${selectedObject.id}/versions/${versionId}/activate`, {});
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `Failed to activate version (${response.status})`);
      }
      invalidateCache('/api/firewalls');
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function toggleArchive(item) {
    const action = item.archived ? 'restore' : 'archive';
    const response = await postJson(`/api/firewalls/${item.id}/${action}`, {});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      error = payload?.error || `Failed to ${action} firewall`;
      return;
    }
    invalidateCache('/api/firewalls');
    await refresh();
  }

  async function runValidation() {
    if (!selectedObject) return;
    error = '';
    const response = await postJson(`/api/firewalls/${selectedObject.id}/validate`, {
      policyText: selectedObject.policyText,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok && payload?.error) {
      error = payload.error;
      return;
    }
    simulatorResult = {
      mode: 'validation',
      valid: payload?.valid === true,
      errors: payload?.errors || [],
      warnings: payload?.warnings || [],
      diagnostics: payload?.diagnostics || null,
      effectivePolicyPreview: payload?.effectivePolicyPreview || null,
      at: new Date().toISOString()
    };
    invalidateCache('/api/firewalls');
    await refresh();
  }

  async function runSimulation() {
    if (!selectedObject || !simulatorPrompt.trim()) return;
    error = '';
    const response = await postJson(`/api/firewalls/${selectedObject.id}/simulate`, {
      prompt: simulatorPrompt,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      error = payload?.error || `Failed to simulate firewall (${response.status})`;
      return;
    }
    simulatorResult = { mode: 'simulation', ...(payload.result || {}) };
    invalidateCache('/api/firewalls');
    await refresh();
  }

  async function addSnippet() {
    if (!selectedObject || !snippetContent.trim()) return;
    error = '';
    const response = await postJson(`/api/firewalls/${selectedObject.id}/entries/text`, {
      name: snippetName || `policy-context-${Date.now()}.txt`,
      content: snippetContent,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      error = payload?.error || `Failed to add snippet (${response.status})`;
      return;
    }
    snippetName = '';
    snippetContent = '';
    invalidateCache('/api/firewalls');
    await refresh();
  }

  async function uploadFile(file) {
    if (!selectedObject || !file) return;
    error = '';
    const formData = new FormData();
    formData.set('file', file);
    const response = await postForm(`/api/firewalls/${selectedObject.id}/entries/file`, formData);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      error = payload?.error || `Failed to upload file (${response.status})`;
      return;
    }
    invalidateCache('/api/firewalls');
    await refresh();
  }

  async function removeEntry(entryId) {
    if (!selectedObject) return;
    error = '';
    try {
      await deleteJson(`/api/firewalls/${selectedObject.id}/entries/${entryId}`);
      invalidateCache('/api/firewalls');
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<AppShell>
  <section class="page">
    <section class="card section">
      <div class="head">
        <div>
          <h1>Firewall Definition Zone</h1>
          <p class="muted">Create, version, simulate, and activate gateway-backed firewall policies.</p>
        </div>
      </div>

      <div class="builder">
        <label><span>Name</span><input bind:value={entityName} placeholder="Payroll Policy" /></label>
        <label><span>Folder</span><input bind:value={folderName} placeholder="Finance" /></label>
        <label>
          <span>Scope</span>
          <select bind:value={scope}>
            <option value="global">Global</option>
            <option value="agent">Agent</option>
          </select>
        </label>
        {#if scope === 'agent'}
          <label>
            <span>Agent</span>
            <select bind:value={selectedAgentId}>
              {#each agentOptions as option}
                <option value={option.id}>{option.name}</option>
              {/each}
            </select>
          </label>
        {/if}
        <label class="full">
          <span>Policy</span>
          <textarea rows="6" bind:value={policyText} placeholder={`version: 1\nrules:\n  allowedTools:\n    - status\n    - skills\n  blockedTargetProfiles:\n    - root\n  constraints:\n    allowDevProfile: false\n    maxTimeoutSeconds: 30`}></textarea>
        </label>
      </div>

      <div class="actions">
        <button class="pill cta" on:click={activateFirewall} disabled={!entityName.trim() || !policyText.trim()}>Activate Firewall</button>
      </div>
      {#if error}<p class="err">{error}</p>{/if}
    </section>

    <div class="workspace">
      <aside class="card section sidebar">
        <div class="sidebar-head">
          <h2>Policy Library</h2>
          <div class="toggle">
            <button class:active={libraryView === 'active'} on:click={() => (libraryView = 'active')}>Current</button>
            <button class:active={libraryView === 'archived'} on:click={() => (libraryView = 'archived')}>Archived</button>
          </div>
        </div>
        {#if loading}
          <p class="muted">Loading firewalls...</p>
        {:else if visibleObjects.length === 0}
          <p class="muted">{libraryView === 'archived' ? 'No archived firewalls.' : 'No firewalls yet.'}</p>
        {:else}
          <div class="list">
            {#each visibleObjects as item}
              <button class:selected={selectedObject?.id === item.id} class="firewall-row" on:click={() => setSelected(item.id)}>
                <strong>{item.name}</strong>
                <span>{item.scope === 'agent' ? 'Agent' : 'Global'} · {item.status}</span>
                <small>{item.folder || 'root'}</small>
              </button>
            {/each}
          </div>
        {/if}
      </aside>

      <section class="card section detail">
        {#if !selectedObject}
          <p class="muted">Select a firewall to inspect it.</p>
        {:else}
          <div class="detail-head">
            <div>
              <h2>{selectedObject.name}</h2>
              <p class="muted">{selectedObject.scope === 'agent' ? `Agent-scoped to ${selectedObject.assignedAgentId || 'unassigned'}` : 'Global policy'} · {selectedObject.status}</p>
            </div>
            <div class="row-actions">
              <button class="pill" on:click={saveMetadata}>Save Metadata</button>
              <button class="pill" on:click={() => toggleArchive(selectedObject)}>{selectedObject.archived ? 'Restore' : 'Archive'}</button>
            </div>
          </div>

          <div class="builder compact">
            <label><span>Name</span><input bind:value={selectedObject.name} /></label>
            <label><span>Folder</span><input bind:value={selectedObject.folder} /></label>
            <label>
              <span>Scope</span>
              <select bind:value={selectedObject.scope}>
                <option value="global">Global</option>
                <option value="agent">Agent</option>
              </select>
            </label>
            {#if selectedObject.scope === 'agent'}
              <label>
                <span>Agent</span>
                <select bind:value={selectedObject.assignedAgentId}>
                  {#each agentOptions as option}
                    <option value={option.id}>{option.name}</option>
                  {/each}
                </select>
              </label>
            {/if}
            <label class="full"><span>Active Policy YAML</span><textarea rows="6" bind:value={selectedObject.policyText} readonly></textarea></label>
          </div>

          <div class="tabs">
            <button class:active={consoleTab === 'simulator'} on:click={() => (consoleTab = 'simulator')}>Simulator</button>
            <button class:active={consoleTab === 'versions'} on:click={() => (consoleTab = 'versions')}>Versions</button>
            <button class:active={consoleTab === 'entries'} on:click={() => (consoleTab = 'entries')}>Entries</button>
            <button class:active={consoleTab === 'audit'} on:click={() => (consoleTab = 'audit')}>Audit</button>
          </div>

          {#if consoleTab === 'simulator'}
            <section class="panel">
              <textarea rows="6" bind:value={simulatorPrompt} placeholder={`tool: status\ntargetProfile: worker_a\nsourceProfile: controller_a\ntimeoutSeconds: 20\nmaxBufferMb: 4`}></textarea>
              <div class="row-actions">
                <button class="pill" on:click={runValidation}>Validate</button>
                <button class="pill cta" on:click={runSimulation} disabled={!simulatorPrompt.trim()}>Run Simulation</button>
              </div>
              {#if simulatorResult}
                {#if simulatorResult.mode === 'validation'}
                  <p class:warn={!simulatorResult.valid} class:safe={simulatorResult.valid}>
                    {simulatorResult.valid ? 'Validation passed.' : 'Validation failed.'}
                  </p>
                  {#if (simulatorResult.errors || []).length > 0}
                    <pre>{simulatorResult.errors.join('\n')}</pre>
                  {/if}
                  {#if (simulatorResult.warnings || []).length > 0}
                    <pre>{simulatorResult.warnings.join('\n')}</pre>
                  {/if}
                  {#if simulatorResult.effectivePolicyPreview?.policy}
                    <pre>{JSON.stringify(simulatorResult.effectivePolicyPreview, null, 2)}</pre>
                  {/if}
                {:else}
                  <p class:warn={simulatorResult.blocked} class:safe={!simulatorResult.blocked}>
                    {simulatorResult.blocked ? 'Blocked' : 'Allowed'}: {(simulatorResult.reasons || []).join(', ') || 'No blocking reasons.'}
                  </p>
                  {#if (simulatorResult.warnings || []).length > 0}
                    <pre>{simulatorResult.warnings.join('\n')}</pre>
                  {/if}
                  {#if (simulatorResult.evaluation || []).length > 0}
                    <pre>{JSON.stringify(simulatorResult.evaluation, null, 2)}</pre>
                  {/if}
                {/if}
              {/if}
            </section>
          {:else if consoleTab === 'versions'}
            <section class="panel">
              <textarea rows="6" bind:value={revisionText} placeholder="Write a new YAML policy revision..."></textarea>
              <button class="pill cta" on:click={saveRevision} disabled={!revisionText.trim()}>Save Revision</button>
              <div class="version-list">
                {#each selectedObject.policyVersions || [] as version}
                  <article class="version">
                    <div class="version-head">
                      <strong>{version.active ? 'Active' : 'Draft'} · {formatTime(version.timestamp)}</strong>
                      {#if !version.active}
                        <button class="pill" on:click={() => activateVersion(version.id)}>Activate</button>
                      {/if}
                    </div>
                    <p class:warn={version.compiled === false} class:safe={version.compiled === true}>
                      {version.compiled === true ? 'Compiled' : version.compiled === false ? 'Compile failed' : 'Compile pending'}
                    </p>
                    {#if (version.compileErrors || []).length > 0}
                      <pre>{version.compileErrors.join('\n')}</pre>
                    {/if}
                    <pre>{version.text}</pre>
                  </article>
                {/each}
              </div>
            </section>
          {:else if consoleTab === 'entries'}
            <section class="panel">
              <div class="builder compact">
                <label><span>Snippet Name</span><input bind:value={snippetName} placeholder="reference.txt" /></label>
                <label class="full"><span>Snippet Content</span><textarea rows="3" bind:value={snippetContent}></textarea></label>
              </div>
              <div class="row-actions">
                <button class="pill" on:click={addSnippet} disabled={!snippetContent.trim()}>Add Snippet</button>
                <label class="upload pill">
                  Upload File
                  <input type="file" on:change={(event) => uploadFile(event.currentTarget.files?.[0])} />
                </label>
              </div>
              <div class="entry-list">
                {#if (selectedObject.entries || []).length === 0}
                  <p class="muted">No entries attached yet.</p>
                {:else}
                  {#each selectedObject.entries as entry}
                    <article class="entry">
                      <div>
                        <strong>{entry.name}</strong>
                        <p class="muted">{entry.mimeType} · {formatBytes(entry.sizeBytes)}</p>
                        {#if entry.preview}<pre>{entry.preview}</pre>{/if}
                      </div>
                      <button class="pill" on:click={() => removeEntry(entry.id)}>Remove</button>
                    </article>
                  {/each}
                {/if}
              </div>
            </section>
          {:else}
            <section class="panel">
              <h3>Audit Log</h3>
              {#if (selectedObject.auditLog || []).length === 0}
                <p class="muted">No audit entries yet.</p>
              {:else}
                {#each selectedObject.auditLog as entry}
                  <article class="audit">
                    <strong>{entry.message}</strong>
                    <small>{entry.level} · {formatTime(entry.timestamp)}</small>
                  </article>
                {/each}
              {/if}

              <h3>Blocked Packets</h3>
              {#if (selectedObject.blockedPackets || []).length === 0}
                <p class="muted">No blocked packets yet.</p>
              {:else}
                {#each selectedObject.blockedPackets as packet}
                  <article class="audit">
                    <strong>{packet.reason}</strong>
                    <small>{packet.destination} · {formatTime(packet.timestamp)}</small>
                    <pre>{packet.snippet}</pre>
                  </article>
                {/each}
              {/if}
            </section>
          {/if}
        {/if}
      </section>
    </div>
  </section>
</AppShell>

<style>
  .page { min-height: calc(100svh - 24px); display: grid; gap: 12px; }
  .section { padding: 14px; }
  .head, .sidebar-head, .detail-head, .version-head, .row-actions { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
  .builder { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .builder.compact { margin-top: 12px; }
  .builder .full { grid-column: 1 / -1; }
  .workspace { display: grid; gap: 12px; grid-template-columns: 320px 1fr; }
  .sidebar, .detail { min-height: 520px; }
  .list { display: grid; gap: 8px; }
  .firewall-row { display: grid; gap: 2px; text-align: left; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--row-border); background: var(--row-bg); color: var(--fg); }
  .firewall-row.selected { border-color: rgba(249,115,22,.45); background: rgba(249,115,22,.12); }
  .tabs { display: flex; gap: 8px; margin: 14px 0; flex-wrap: wrap; }
  .tabs button, .toggle button, .actions button, .row-actions button, .upload {
    padding: 8px 12px; border-radius: 999px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--fg); cursor: pointer;
  }
  .tabs button.active, .toggle button.active, .cta { border-color: rgba(249,115,22,.45); background: rgba(249,115,22,.2); }
  .panel, .version-list, .entry-list { display: grid; gap: 10px; }
  .version, .entry, .audit { border: 1px solid var(--row-border); border-radius: 12px; padding: 10px; background: var(--row-bg); }
  label span { display: block; margin-bottom: 4px; font-size: 12px; color: var(--muted); }
  input, select, textarea, pre {
    width: 100%; border: 1px solid var(--input-border); border-radius: 12px; background: var(--input-bg); color: var(--fg); padding: 9px 11px; outline: none;
  }
  pre { overflow: auto; white-space: pre-wrap; }
  .muted, small { color: var(--muted); }
  .err { margin: 8px 0 0; color: var(--warn); }
  .warn { color: var(--caution); }
  .safe { color: var(--ok); }
  .upload { position: relative; overflow: hidden; display: inline-flex; align-items: center; }
  .upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  @media (max-width: 900px) {
    .workspace { grid-template-columns: 1fr; }
  }
</style>
