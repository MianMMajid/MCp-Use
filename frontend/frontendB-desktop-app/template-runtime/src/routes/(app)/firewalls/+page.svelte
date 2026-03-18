<script>
  import { onMount } from 'svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import ConfirmDialog from '@/lib/components/ConfirmDialog.svelte';
  import { loadJson, postJson, patchJson, deleteJson, postForm, invalidateCache } from '@/lib/api';
  import { toastStore } from '@/lib/stores/toast-store';
  import { humanizeError } from '@/lib/utils/error-display';

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

  // ── Activate wizard state ──────────────────────────────────────────────────
  let activateStep = 1;
  let enforcementLevel = 'hard-mandatory';
  let description = '';
  let activatePreviewResult = null;
  let activateBusy = false;
  let templateId = '';

  const ENFORCEMENT_LEVELS = [
    { id: 'hard-mandatory', label: 'Hard Mandatory', desc: 'Block violations immediately. No override.' },
    { id: 'soft-mandatory', label: 'Soft Mandatory', desc: 'Block violations, but operators can override with reason.' },
    { id: 'advisory', label: 'Advisory', desc: 'Log violations as warnings. Never block.' },
  ];

  const POLICY_TEMPLATES = [
    { id: '', label: 'Blank', desc: 'Write policy YAML from scratch', yaml: '' },
    { id: 'restrictive', label: 'Restrictive', desc: 'Block by default, allow only safe tools', yaml: `version: 1\nrules:\n  defaultAction: block\n  allowedTools:\n    - status\n    - health\n  blockedTargetProfiles:\n    - root\n    - system\n  constraints:\n    allowDevProfile: false\n    maxTimeoutSeconds: 30\n    maxBufferMb: 4` },
    { id: 'permissive', label: 'Permissive', desc: 'Allow by default, block dangerous operations', yaml: `version: 1\nrules:\n  defaultAction: allow\n  blockedTools:\n    - setup\n    - reset\n    - uninstall\n    - daemon\n  blockedTargetProfiles:\n    - root\n  constraints:\n    allowDevProfile: true\n    maxTimeoutSeconds: 120` },
    { id: 'audit-only', label: 'Audit Only', desc: 'Log everything, block nothing', yaml: `version: 1\nrules:\n  defaultAction: allow\n  auditAll: true\n  constraints:\n    allowDevProfile: true\n    maxTimeoutSeconds: 120` },
    { id: 'dlp-basic', label: 'DLP (Basic)', desc: 'Block data-export tools and sensitive-data profiles', yaml: `version: 1\n# Data Loss Prevention (Basic)\n# Blocks profiles that handle sensitive data and prevents\n# data-export tools from running.\nrules:\n  defaultAction: block\n  allowedTools:\n    - status\n    - health\n    - list\n    - info\n    - check\n  dangerousTools:\n    - export\n    - download\n    - sync\n    - backup\n    - replicate\n    - dump\n    - extract\n    - migrate\n  blockedTargetProfiles:\n    - data-exporter\n    - etl-pipeline\n    - backup-agent\n    - reporting\n    - analytics\n    - root\n    - system\n  constraints:\n    allowDevProfile: false\n    maxTimeoutSeconds: 30\n    maxBufferMb: 2\n    approvalTtlSeconds: 300` },
    { id: 'topical-boundary', label: 'Topical Boundary', desc: 'Restrict agent to a single domain (e.g. customer support)', yaml: `version: 1\n# Topical Boundary — Customer Support\n# Restricts agent to customer-support tools only.\n# Duplicate and edit allowedTools for other domains.\nrules:\n  defaultAction: block\n  allowedTools:\n    - tickets\n    - contacts\n    - messages\n    - knowledge-base\n    - status\n    - health\n  dangerousTools:\n    - billing\n    - refund\n    - account-delete\n    - escalate\n    - transfer\n  blockedTargetProfiles:\n    - admin\n    - root\n    - system\n    - finance\n    - engineering\n  constraints:\n    allowDevProfile: false\n    maxTimeoutSeconds: 60\n    maxBufferMb: 4` },
    { id: 'zero-trust', label: 'Zero Trust', desc: 'Maximum lockdown — smallest allowlist, shortest timeouts', yaml: `version: 1\n# Zero Trust Agent\n# Maximum lockdown: smallest possible allowlist,\n# shortest timeouts, tightest constraints.\nrules:\n  defaultAction: block\n  allowedTools:\n    - status\n    - health\n  dangerousTools:\n    - setup\n    - reset\n    - uninstall\n    - daemon\n    - deploy\n    - execute\n    - run\n    - install\n    - skills\n    - plugins\n    - config\n    - system\n  blockedTargetProfiles:\n    - root\n    - system\n    - admin\n    - operator\n    - service\n    - default\n  constraints:\n    allowDevProfile: false\n    maxTimeoutSeconds: 10\n    maxBufferMb: 1\n    approvalTtlSeconds: 120` },
    { id: 'prompt-injection-shield', label: 'Prompt Injection Shield', desc: 'Block common prompt injection patterns in input', yaml: `version: 2\n# Prompt Injection Shield\n# Detects and blocks common prompt injection patterns.\nrules:\n  inputRails:\n    promptInjection: true\n    maxInputLength: 8000\n    blockedPatterns:\n      - "ignore previous instructions"\n      - "you are now"\n      - "disregard.*above"\n      - "system:\\\\s*you are"\n      - "\\\\[INST\\\\]"\n      - "<\\\\|im_start\\\\|>"\n  constraints:\n    allowDevProfile: false\n    maxTimeoutSeconds: 60` },
    { id: 'content-safety', label: 'Content Safety', desc: 'Filter harmful content across 6 categories', yaml: `version: 2\n# Content Safety\n# Monitors and blocks harmful content categories.\nrules:\n  contentSafety:\n    enabled: true\n    categories:\n      - hate\n      - violence\n      - sexual\n      - self-harm\n      - criminal\n      - harassment\n    action: block\n  constraints:\n    allowDevProfile: false\n    maxTimeoutSeconds: 60` },
    { id: 'rate-limiting', label: 'Rate Limiting', desc: 'Enforce request and token rate limits', yaml: `version: 2\n# Rate Limiting\n# Prevents runaway agents from overwhelming backends.\nrules:\n  rateLimits:\n    maxRequestsPerMinute: 20\n    maxTokensPerHour: 100000\n    windowType: sliding\n  constraints:\n    maxTimeoutSeconds: 60` },
    { id: 'output-validation', label: 'Output Validation', desc: 'Validate and redact sensitive patterns in output', yaml: `version: 2\n# Output Validation\n# Truncates oversized responses and redacts\n# sensitive patterns (SSN, credit card, passwords).\nrules:\n  outputRails:\n    maxResponseTokens: 4096\n    requireJsonSchema: false\n    blockedOutputPatterns:\n      - "\\\\b\\\\d{3}-\\\\d{2}-\\\\d{4}\\\\b"\n      - "\\\\b\\\\d{16}\\\\b"\n      - "password\\\\s*[:=]\\\\s*\\\\S+"\n  constraints:\n    maxTimeoutSeconds: 60` },
  ];

  function applyTemplate() {
    const tpl = POLICY_TEMPLATES.find((t) => t.id === templateId);
    if (tpl?.yaml) policyText = tpl.yaml;
  }

  function resetActivateForm() {
    activateStep = 1;
    entityName = '';
    folderName = '';
    policyText = '';
    scope = 'global';
    selectedAgentId = '';
    enforcementLevel = 'hard-mandatory';
    description = '';
    templateId = '';
    activatePreviewResult = null;
  }

  // postJson/patchJson now return parsed JSON, not Response objects.
  // These helpers handle both for backward compatibility.
  async function readResponsePayload(response) {
    if (typeof response?.json === 'function') {
      return await response.json().catch(() => ({}));
    }
    return response ?? {};
  }

  function isResponseOk(response, payload) {
    // If postJson returned parsed JSON, check payload.ok directly
    if (typeof response?.ok === 'boolean' && typeof response?.status === 'number') {
      return response.ok; // Raw Response object
    }
    return payload?.ok !== false && response?.ok !== false;
  }

  function responseStatus(response) {
    if (typeof response?.status === 'number' && typeof response?.ok === 'boolean') {
      return response.status; // Raw Response object
    }
    return 200; // Parsed JSON — postJson already threw if !res.ok
  }

  async function previewBeforeActivate() {
    activateBusy = true;
    activatePreviewResult = null;
    try {
      // postJson returns parsed JSON (not a Response object)
      const data = await postJson('/api/firewalls/preview', {
        policyText,
        name: entityName,
        scope,
        assignedAgentId: scope === 'agent' ? selectedAgentId : null,
      });
      activatePreviewResult = {
        ok: data?.ok !== false,
        valid: data?.valid === true,
        errors: Array.isArray(data?.errors) ? data.errors : [],
        warnings: Array.isArray(data?.warnings) ? data.warnings : [],
        ruleCount: data?.ruleCount ?? 0,
      };
    } catch (err) {
      activatePreviewResult = { ok: false, valid: false, errors: [err instanceof Error ? err.message : String(err)], warnings: [], ruleCount: 0 };
    } finally {
      activateBusy = false;
    }
  }

  $: activateStepValid = {
    1: entityName.trim().length > 0,
    2: policyText.trim().length > 0,
    3: !(scope === 'agent' && !selectedAgentId),
  };

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
  $: agentScopeDisabled = agentOptions.length === 0;
  $: if (agentScopeDisabled && scope === 'agent') {
    scope = 'global';
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
      // postJson returns parsed JSON (not a Response object)
      const data = await postJson('/api/firewalls', {
        name: entityName,
        folder: folderName || 'root',
        scope,
        assignedAgentId: scope === 'agent' ? selectedAgentId || null : null,
        policyText,
        description,
        enforcementLevel,
      });
      if (data?.ok === false) {
        throw new Error(data?.error || 'Failed to create firewall');
      }
      toastStore.success(`Firewall "${entityName}" deployed`);
      invalidateCache('/api/firewalls');
      await refresh();
      if (data?.firewall?.id) setSelected(data.firewall.id);
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
        description: selectedObject.description ?? '',
        enforcementLevel: selectedObject.enforcementLevel ?? 'hard-mandatory',
      });
      const payload = await readResponsePayload(response);
      if (!isResponseOk(response, payload) || payload?.ok === false) {
        throw new Error(payload?.error || `Failed to save firewall (${responseStatus(response)})`);
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
      const payload = await readResponsePayload(response);
      if (!isResponseOk(response, payload) || payload?.ok === false) {
        throw new Error(payload?.error || `Failed to save revision (${responseStatus(response)})`);
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
      const payload = await readResponsePayload(response);
      if (!isResponseOk(response, payload) || payload?.ok === false) {
        throw new Error(payload?.error || `Failed to activate version (${responseStatus(response)})`);
      }
      invalidateCache('/api/firewalls');
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  // Confirmation state
  let confirmOpen = false;
  let confirmTitle = '';
  let confirmMessage = '';
  let confirmLabel = 'Confirm';
  let confirmDanger = false;
  let confirmAction = () => {};

  function requestConfirm(title, message, action, { label = 'Confirm', danger = false } = {}) {
    confirmTitle = title;
    confirmMessage = message;
    confirmLabel = label;
    confirmDanger = danger;
    confirmAction = action;
    confirmOpen = true;
  }

  function requestArchive(item) {
    const action = item.archived ? 'restore' : 'archive';
    requestConfirm(
      `${item.archived ? 'Restore' : 'Archive'} Firewall`,
      `Are you sure you want to ${action} "${item.name}"?`,
      () => toggleArchive(item),
      { label: item.archived ? 'Restore' : 'Archive', danger: !item.archived }
    );
  }

  function requestRemoveEntry(entryId, entryName) {
    requestConfirm(
      'Remove Entry',
      `Are you sure you want to remove "${entryName || entryId}"? This cannot be undone.`,
      () => removeEntry(entryId),
      { label: 'Remove', danger: true }
    );
  }

  let busyAction = false;

  async function toggleArchive(item) {
    if (busyAction) return;
    busyAction = true;
    const action = item.archived ? 'restore' : 'archive';
    try {
      const response = await postJson(`/api/firewalls/${item.id}/${action}`, {});
      const payload = await readResponsePayload(response);
      if (!isResponseOk(response, payload) || payload?.ok === false) {
        const msg = payload?.error || `Failed to ${action} firewall`;
        error = msg;
        toastStore.error(msg);
        return;
      }
      toastStore.success(`Firewall ${action}d`);
      invalidateCache('/api/firewalls');
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      toastStore.error(error);
    } finally {
      busyAction = false;
    }
  }

  async function runValidation() {
    if (!selectedObject) return;
    error = '';
    const response = await postJson(`/api/firewalls/${selectedObject.id}/validate`, {
      policyText: selectedObject.policyText,
    });
    const payload = await readResponsePayload(response);
    if (!isResponseOk(response, payload) && payload?.error) {
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
    const payload = await readResponsePayload(response);
    if (!isResponseOk(response, payload) || payload?.ok === false) {
      error = payload?.error || `Failed to simulate firewall (${responseStatus(response)})`;
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
    const payload = await readResponsePayload(response);
    if (!isResponseOk(response, payload) || payload?.ok === false) {
      error = payload?.error || `Failed to add snippet (${responseStatus(response)})`;
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
    const payload = await readResponsePayload(response);
    if (!isResponseOk(response, payload) || payload?.ok === false) {
      error = payload?.error || `Failed to upload file (${responseStatus(response)})`;
      return;
    }
    invalidateCache('/api/firewalls');
    await refresh();
  }

  async function removeEntry(entryId) {
    if (!selectedObject || busyAction) return;
    busyAction = true;
    error = '';
    try {
      await deleteJson(`/api/firewalls/${selectedObject.id}/entries/${entryId}`);
      invalidateCache('/api/firewalls');
      toastStore.success('Entry removed');
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      toastStore.error(`Failed to remove entry: ${error}`);
    } finally {
      busyAction = false;
    }
  }
</script>

<AppShell>
  <section class="page">
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
          <div class="empty-state">
            {#if libraryView === 'archived'}
              <p>No archived firewalls.</p>
            {:else}
              <div class="empty-icon">&#128737;</div>
              <p><strong>No firewall policies yet</strong></p>
              <p>Create your first policy to protect agent traffic and enforce tool-level access controls.</p>
              <button class="pill cta" on:click={() => document.querySelector('.activate-section')?.scrollIntoView({ behavior: 'smooth' })}>Create Policy</button>
            {/if}
          </div>
        {:else}
          <div class="list">
            {#each visibleObjects as item}
              <button class:selected={selectedObject?.id === item.id} class="firewall-row" on:click={() => setSelected(item.id)}>
                <strong>{item.name}</strong>
                <span>
                  {item.scope === 'agent' ? 'Agent' : 'Global'} · {item.status}
                  {#if item.enforcementLevel === 'advisory'}
                    <span class="enforcement-badge advisory" title="Advisory — logs only, never blocks">advisory</span>
                  {:else if item.enforcementLevel === 'soft-mandatory'}
                    <span class="enforcement-badge soft" title="Soft Mandatory — blocks with operator override">soft</span>
                  {/if}
                  {#if item.scope === 'agent' && !item.assignedAgentId}
                    <span class="dead-badge" title="No agent assigned — this firewall is not evaluated by the runtime">dead</span>
                  {/if}
                </span>
                <small>{item.folder || 'root'}</small>
              </button>
            {/each}
          </div>
        {/if}
      </aside>

      <section class="card section detail">
        {#if !selectedObject}
          <div class="empty-detail">
            <p class="muted">Select a firewall from the library to inspect, edit, or simulate policies.</p>
          </div>
        {:else}
          <div class="detail-head">
            <div>
              <h2>{selectedObject.name}</h2>
              {#if selectedObject.description}
                <p class="muted" style="margin: 2px 0 4px;">{selectedObject.description}</p>
              {/if}
              <p class="muted">
                {selectedObject.scope === 'agent'
                  ? selectedObject.assignedAgentId
                    ? `Agent-scoped to ${selectedObject.assignedAgentId}`
                    : 'Agent-scoped — no agent assigned'
                  : 'Global policy'} · {selectedObject.status} · {ENFORCEMENT_LEVELS.find((l) => l.id === selectedObject.enforcementLevel)?.label ?? selectedObject.enforcementLevel}
              </p>
              {#if selectedObject.scope === 'agent' && !selectedObject.assignedAgentId}
                <p class="warn" style="font-size: 12px; margin: 4px 0 0;">This firewall has no assigned agent and will not be evaluated by the runtime. Assign an agent or change scope to Global.</p>
              {/if}
            </div>
            <div class="row-actions">
              <button class="pill" on:click={saveMetadata} disabled={!selectedObject.name?.trim() || (selectedObject.scope === 'agent' && !selectedObject.assignedAgentId)}>Save Metadata</button>
              <button class="pill" on:click={() => requestArchive(selectedObject)}>{selectedObject.archived ? 'Restore' : 'Archive'}</button>
            </div>
          </div>

          <div class="builder compact">
            <label><span>Name</span><input bind:value={selectedObject.name} maxlength="255" /></label>
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
                {#if agentOptions.length === 0}
                  <p class="warn" style="font-size: 12px; margin: 0;">No agents available. Create an agent first or change scope to Global.</p>
                {:else}
                  <select bind:value={selectedObject.assignedAgentId}>
                    {#each agentOptions as option}
                      <option value={option.id}>{option.name}</option>
                    {/each}
                  </select>
                {/if}
              </label>
            {/if}
            <label><span>Description</span><input bind:value={selectedObject.description} placeholder="What this firewall protects" /></label>
            <label>
              <span>Enforcement</span>
              <select bind:value={selectedObject.enforcementLevel}>
                {#each ENFORCEMENT_LEVELS as level}
                  <option value={level.id}>{level.label}</option>
                {/each}
              </select>
            </label>
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
                  {#if simulatorResult.resolvedScope}
                    <p class="muted" style="font-size: 12px;">
                      Evaluated against: <strong>{simulatorResult.resolvedScope}</strong> bundle
                      {#if simulatorResult.resolvedScope === 'default' && selectedObject?.scope === 'agent'}
                        <span class="warn"> — your agent firewall was NOT used (no agent assigned or agent not matched)</span>
                      {/if}
                    </p>
                  {/if}
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
                      <button class="pill" on:click={() => requestRemoveEntry(entry.id, entry.name)}>Remove</button>
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

    <section class="card section activate-section">
      <div class="head">
        <div>
          <h2>Activate Firewall</h2>
          <p class="muted">Create a new gateway-backed firewall policy.</p>
        </div>
        {#if activateStep > 1}
          <button class="pill" on:click={resetActivateForm}>Start Over</button>
        {/if}
      </div>

      <div class="wizard-steps">
        <button class="step" class:active={activateStep === 1} class:done={activateStep > 1} on:click={() => { if (activateStep > 1) activateStep = 1; }}>
          <span class="step-num">{activateStep > 1 ? '&#10003;' : '1'}</span> Identity
        </button>
        <span class="step-line"></span>
        <button class="step" class:active={activateStep === 2} class:done={activateStep > 2} on:click={() => { if (activateStep > 2) activateStep = 2; }} disabled={activateStep < 2}>
          <span class="step-num">{activateStep > 2 ? '&#10003;' : '2'}</span> Policy
        </button>
        <span class="step-line"></span>
        <button class="step" class:active={activateStep === 3} class:done={activateStep > 3} disabled={activateStep < 3}>
          <span class="step-num">{activateStep > 3 ? '&#10003;' : '3'}</span> Review & Deploy
        </button>
      </div>

      {#if activateStep === 1}
        <div class="identity-form">
          <label class="full"><span>Name</span><input bind:value={entityName} placeholder="Payroll Policy" maxlength="255" /></label>
          <label class="full"><span>Description</span><input bind:value={description} placeholder="Restricts payroll tools to approved agents" /></label>
          <div class="form-row-2">
            <label><span>Folder</span><input bind:value={folderName} placeholder="Finance" /></label>
            <label>
              <span>Scope</span>
              <select bind:value={scope}>
                <option value="global">Global — applies to all agents</option>
                <option value="agent" disabled={agentScopeDisabled}>Agent — scoped to one agent{agentScopeDisabled ? ' (none available)' : ''}</option>
              </select>
            </label>
          </div>
          {#if scope === 'agent'}
            <label class="full">
              <span>Agent</span>
              {#if agentOptions.length === 0}
                <p class="muted">No agents available. Create an agent first.</p>
              {:else}
                <select bind:value={selectedAgentId}>
                  {#each agentOptions as option}
                    <option value={option.id}>{option.name}</option>
                  {/each}
                </select>
              {/if}
            </label>
          {/if}
          <label class="full">
            <span>Enforcement Level</span>
            <select bind:value={enforcementLevel}>
              {#each ENFORCEMENT_LEVELS as level}
                <option value={level.id}>{level.label} — {level.desc}</option>
              {/each}
            </select>
          </label>
        </div>
        <div class="actions">
          <button class="pill cta" on:click={() => (activateStep = 2)} disabled={!activateStepValid[1]}>Next: Define Policy</button>
        </div>

      {:else if activateStep === 2}
        <div class="builder">
          <label>
            <span>Start from template</span>
            <select bind:value={templateId} on:change={applyTemplate}>
              {#each POLICY_TEMPLATES as tpl}
                <option value={tpl.id}>{tpl.label} — {tpl.desc}</option>
              {/each}
            </select>
          </label>
          <label class="full">
            <span>Policy YAML</span>
            <textarea rows="12" bind:value={policyText} placeholder={`version: 1\nrules:\n  defaultAction: block\n  allowedTools:\n    - status\n    - skills\n  blockedTargetProfiles:\n    - root\n  constraints:\n    allowDevProfile: false\n    maxTimeoutSeconds: 30`}></textarea>
          </label>
        </div>
        <div class="actions">
          <button class="pill" on:click={() => (activateStep = 1)}>Back</button>
          <button class="pill cta" on:click={async () => { await previewBeforeActivate(); activateStep = 3; }} disabled={!activateStepValid[2] || activateBusy}>
            {activateBusy ? 'Validating...' : 'Next: Review'}
          </button>
        </div>

      {:else}
        <div class="review-grid">
          <article class="review-card">
            <h3>Identity</h3>
            <dl>
              <dt>Name</dt><dd>{entityName}</dd>
              <dt>Folder</dt><dd>{folderName || 'root'}</dd>
              {#if description}<dt>Description</dt><dd>{description}</dd>{/if}
              <dt>Scope</dt><dd>{scope === 'agent' ? `Agent: ${selectedAgentId}` : 'Global'}</dd>
              <dt>Enforcement</dt><dd>{ENFORCEMENT_LEVELS.find((l) => l.id === enforcementLevel)?.label ?? enforcementLevel}</dd>
            </dl>
          </article>
          <article class="review-card">
            <h3>Policy Preview</h3>
            {#if activatePreviewResult}
              {#if activatePreviewResult.valid}
                <p class="safe">Valid — {activatePreviewResult.ruleCount} rule{activatePreviewResult.ruleCount === 1 ? '' : 's'} detected.</p>
              {:else}
                <p class="warn">Validation issues detected.</p>
              {/if}
              {#if activatePreviewResult.errors.length > 0}
                <div class="preview-issues">
                  {#each activatePreviewResult.errors as err}<p class="err">{err}</p>{/each}
                </div>
              {/if}
              {#if activatePreviewResult.warnings.length > 0}
                <div class="preview-issues">
                  {#each activatePreviewResult.warnings as warn}<p class="warn">{warn}</p>{/each}
                </div>
              {/if}
            {:else}
              <p class="muted">Preview unavailable — policy will be validated on activation.</p>
            {/if}
            <pre class="policy-preview">{policyText}</pre>
          </article>
        </div>
        {#if enforcementLevel === 'hard-mandatory'}
          <p class="enforcement-notice">This policy will <strong>block</strong> matching requests immediately with no operator override.</p>
        {/if}
        <div class="actions">
          <button class="pill" on:click={() => { activatePreviewResult = null; activateStep = 2; }}>Back</button>
          <button class="pill cta" on:click={async () => { await activateFirewall(); resetActivateForm(); }} disabled={!activateStepValid[3] || (activatePreviewResult && !activatePreviewResult.valid)}>
            Deploy Firewall
          </button>
          <button class="pill" on:click={async () => { await activateFirewall(); resetActivateForm(); }} disabled={!activateStepValid[3]}>
            Deploy Anyway (skip validation)
          </button>
        </div>
      {/if}
      {#if error}
        <div class="error-banner">
          <p>{humanizeError(error)}</p>
          <button type="button" class="pill" on:click={refresh}>Retry</button>
        </div>
      {/if}
    </section>
  </section>
</AppShell>

<ConfirmDialog
  bind:open={confirmOpen}
  title={confirmTitle}
  message={confirmMessage}
  confirmLabel={confirmLabel}
  danger={confirmDanger}
  onConfirm={confirmAction}
/>

<style>
  /* ── Page layout ── */
  .page {
    min-height: calc(100svh - 92px);
    display: grid;
    gap: 16px;
    align-content: start;
  }
  .section { padding: 18px 20px; }

  /* ── Shared row layouts ── */
  .head, .sidebar-head, .detail-head, .version-head, .row-actions {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }

  /* ── Form builder grid ── */
  .builder {
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }
  .builder.compact { margin-top: 16px; }
  .builder .full { grid-column: 1 / -1; }

  /* ── Identity form (stacked single-column) ── */
  .identity-form {
    display: grid;
    gap: 14px;
  }
  .identity-form .full { width: 100%; }
  .form-row-2 {
    display: grid;
    gap: 14px;
    grid-template-columns: 1fr 1fr;
  }
  @media (max-width: 640px) {
    .form-row-2 { grid-template-columns: 1fr; }
  }

  /* ── Empty states ── */
  .empty-state {
    display: grid;
    place-items: center;
    text-align: center;
    gap: 6px;
    padding: 2rem 1rem;
    color: var(--muted);
  }
  .empty-state strong { color: var(--fg); }
  .empty-state p { margin: 0; font-size: 13px; max-width: 32ch; }
  .empty-state .pill { margin-top: 8px; }
  .empty-icon { font-size: 2.5rem; line-height: 1; opacity: 0.5; }
  .empty-detail {
    display: grid;
    place-items: center;
    min-height: 200px;
    text-align: center;
  }

  /* ── Error banner ── */
  .error-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid rgba(251, 113, 133, 0.35);
    background: rgba(251, 113, 133, 0.1);
    color: #fca5a5;
    font-size: 13px;
  }
  .error-banner p { margin: 0; flex: 1; }
  .error-banner .pill { flex-shrink: 0; }

  /* ── Workspace: sidebar + detail ── */
  .workspace {
    display: grid;
    gap: 16px;
    grid-template-columns: 300px 1fr;
    align-items: start;
  }
  .sidebar {
    max-height: calc(100svh - 160px);
    overflow-y: auto;
  }
  .detail {
    max-height: calc(100svh - 160px);
    overflow-y: auto;
  }

  /* ── Sidebar list ── */
  .list { display: grid; gap: 6px; }
  .firewall-row {
    display: grid;
    gap: 4px;
    text-align: left;
    padding: 11px 14px;
    border-radius: 12px;
    border: 1px solid var(--row-border);
    background: var(--row-bg);
    color: var(--fg);
    cursor: pointer;
    transition: border-color .12s, background .12s;
  }
  .firewall-row:hover { border-color: rgba(249,115,22,.25); }
  .firewall-row.selected {
    border-color: rgba(249,115,22,.45);
    background: rgba(249,115,22,.12);
  }

  /* ── Badges ── */
  .dead-badge, .enforcement-badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 999px;
    font-size: 10px;
    margin-left: 4px;
    vertical-align: middle;
  }
  .dead-badge {
    background: rgba(251,113,133,.18);
    color: #fca5a5;
    border: 1px solid rgba(251,113,133,.35);
  }
  .enforcement-badge.advisory {
    background: rgba(250,204,21,.15);
    color: #fde047;
    border: 1px solid rgba(250,204,21,.3);
  }
  .enforcement-badge.soft {
    background: rgba(96,165,250,.15);
    color: #93c5fd;
    border: 1px solid rgba(96,165,250,.3);
  }

  /* ── Detail head separator ── */
  .detail-head {
    padding-bottom: 14px;
    border-bottom: 1px solid var(--row-border);
    margin-bottom: 4px;
  }

  /* ── Tabs ── */
  .tabs {
    display: flex;
    gap: 8px;
    margin: 18px 0 14px;
    flex-wrap: wrap;
  }
  .tabs button, .toggle button, .actions button, .row-actions button, .upload {
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid var(--input-border);
    background: var(--input-bg);
    color: var(--fg);
    cursor: pointer;
    font-size: 13px;
    transition: border-color .12s, background .12s;
  }
  .tabs button:hover, .toggle button:hover, .actions button:hover, .row-actions button:hover {
    border-color: rgba(249,115,22,.3);
  }
  .tabs button.active, .toggle button.active, .cta {
    border-color: rgba(249,115,22,.45);
    background: rgba(249,115,22,.2);
  }

  /* ── Console panels ── */
  .panel, .version-list, .entry-list {
    display: grid;
    gap: 12px;
  }
  .version, .entry, .audit {
    border: 1px solid var(--row-border);
    border-radius: 12px;
    padding: 14px 16px;
    background: var(--row-bg);
  }

  /* ── Form inputs ── */
  label span {
    display: block;
    margin-bottom: 5px;
    font-size: 12px;
    color: var(--muted);
    letter-spacing: 0.01em;
  }
  input, select, textarea, pre {
    width: 100%;
    border: 1px solid var(--input-border);
    border-radius: 12px;
    background: var(--input-bg);
    color: var(--fg);
    padding: 10px 12px;
    outline: none;
    font-size: 13px;
    transition: border-color .12s;
  }
  input:focus, select:focus, textarea:focus {
    border-color: rgba(249,115,22,.45);
  }
  pre { overflow: auto; white-space: pre-wrap; font-size: 12px; }
  textarea { line-height: 1.5; }

  /* ── Text utilities ── */
  .muted, small { color: var(--muted); }
  .err { margin: 8px 0 0; color: var(--warn); }
  .warn { color: var(--caution); }
  .safe { color: var(--ok); }

  /* ── Upload button ── */
  .upload { position: relative; overflow: hidden; display: inline-flex; align-items: center; }
  .upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

  /* ── Wizard steps ── */
  .wizard-steps {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 16px 0 20px;
  }
  .step {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 14px;
    border-radius: 999px;
    border: 1px solid var(--input-border);
    background: var(--input-bg);
    color: var(--muted);
    cursor: pointer;
    font-size: 13px;
    transition: all .15s;
  }
  .step:disabled { cursor: default; opacity: .5; }
  .step.active {
    border-color: rgba(249,115,22,.45);
    background: rgba(249,115,22,.15);
    color: var(--fg);
  }
  .step.done {
    border-color: rgba(74,222,128,.4);
    color: rgba(74,222,128,.9);
  }
  .step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--row-bg);
    font-size: 11px;
    font-weight: 600;
  }
  .step.active .step-num { background: rgba(249,115,22,.25); }
  .step.done .step-num { background: rgba(74,222,128,.2); }
  .step-line {
    flex: 0 0 20px;
    height: 1px;
    background: var(--input-border);
  }

  /* ── Review cards ── */
  .review-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }
  .review-card {
    border: 1px solid var(--row-border);
    border-radius: 14px;
    padding: 16px 18px;
    background: var(--row-bg);
  }
  .review-card h3 {
    margin: 0 0 10px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .05em;
    color: var(--muted);
  }
  .review-card dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 16px;
    font-size: 13px;
    line-height: 1.5;
  }
  .review-card dt { color: var(--muted); }
  .review-card dd { margin: 0; }
  .policy-preview {
    max-height: 220px;
    overflow: auto;
    font-size: 12px;
    margin-top: 10px;
    line-height: 1.55;
  }
  .preview-issues { display: grid; gap: 4px; margin: 8px 0; }
  .preview-issues p { margin: 0; font-size: 12px; }

  /* ── Enforcement notice ── */
  .enforcement-notice {
    padding: 10px 14px;
    border-radius: 10px;
    background: rgba(251,113,133,.1);
    border: 1px solid rgba(251,113,133,.25);
    color: #fca5a5;
    font-size: 13px;
    margin-bottom: 14px;
    line-height: 1.45;
  }

  /* ── Activate section actions ── */
  .activate-section .actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 16px;
  }

  /* ── Responsive ── */
  @media (max-width: 900px) {
    .workspace { grid-template-columns: 1fr; }
    .review-grid { grid-template-columns: 1fr; }
    .section { padding: 14px; }
  }
</style>
