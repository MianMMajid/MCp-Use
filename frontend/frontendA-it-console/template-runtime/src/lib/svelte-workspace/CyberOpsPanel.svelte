<script>
  import {
    degradedSecurityMessage,
    incidentColor,
    scanColor,
    scanLabel,
  } from '../maple-workspace/cyber-view-model.js'

  export let status = null
  export let policies = null
  export let incidents = []
  export let downloads = []
  export let quarantine = []
  export let suppressions = []
  export let refresh = () => {}
  export let authMe = null

  let busyId = ''
  let cyberError = ''
  let cyberNotice = ''

  let filterSource = ''
  let filterVerdict = ''
  let filterProvider = ''

  let suppressionDraft = {
    scopeType: 'sha256',
    scopeValue: '',
    rationale: '',
    rollbackPath: '',
    provider: '',
    tool: '',
    policyRule: '',
    expiresAt: '',
  }

  $: filteredDownloads = downloads.filter((item) => {
    if (filterSource && !String(item.source ?? '').toLowerCase().includes(filterSource.toLowerCase())) return false
    if (filterVerdict && !String(item.scan?.verdict ?? '').toLowerCase().includes(filterVerdict.toLowerCase())) return false
    if (filterProvider && !String(item.scan?.provider ?? '').toLowerCase().includes(filterProvider.toLowerCase())) return false
    return true
  })

  $: severeOpenIncidents = incidents.filter(
    (item) =>
      item?.state !== 'closed' &&
      item?.state !== 'resolved' &&
      String(item?.severity || '').includes('HIGH'),
  )

  function keyText(item, key) {
    return item?.[key] ?? '--'
  }

  function boolText(value) {
    return value ? 'true' : 'false'
  }

  async function sendJson(path, body = {}) {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || `${path} -> ${response.status}`)
    }
    return payload
  }

  async function runAction(id, fn) {
    busyId = id
    cyberError = ''
    cyberNotice = ''
    try {
      await fn()
      await refresh()
    } catch (err) {
      cyberError = err instanceof Error ? err.message : String(err)
    } finally {
      busyId = ''
    }
  }

  function handleAssign(incident) {
    const id = incident.incidentId ?? incident.id
    if (!id) return
    const ownerId = window.prompt('Assign incident to owner', incident.ownerId || 'secops')
    if (ownerId == null) return
    runAction(id, () => sendJson(`/api/cyber/incidents/${encodeURIComponent(id)}/assign`, { ownerId }))
  }

  function handleStateChange(incident) {
    const id = incident.incidentId ?? incident.id
    if (!id) return
    const state = window.prompt('New incident state', incident.state || 'triaged')
    if (!state) return
    const disposition = window.prompt('Disposition (optional)', incident.disposition || '') ?? ''
    runAction(id, () => sendJson(`/api/cyber/incidents/${encodeURIComponent(id)}/state`, { state, disposition }))
  }

  function handleNote(incident) {
    const id = incident.incidentId ?? incident.id
    if (!id) return
    const note = window.prompt('Add incident note')
    if (!note) return
    runAction(id, () => sendJson(`/api/cyber/incidents/${encodeURIComponent(id)}/note`, { note }))
  }

  function handleReview(item, reviewStatus) {
    const id = item.quarantineId ?? item.id
    if (!id) return
    runAction(id, () => sendJson(`/api/cyber/quarantine/${encodeURIComponent(id)}/review`, { reviewStatus }))
  }

  function handleRelease(item) {
    const id = item.quarantineId ?? item.id
    if (!id) return
    const releaseDisposition = window.prompt('Release disposition', 'operator_release')
    if (!releaseDisposition) return
    runAction(id, () => sendJson(`/api/cyber/quarantine/${encodeURIComponent(id)}/release`, { releaseDisposition }))
  }

  function handleRescan(item) {
    const id = item.quarantineId ?? item.id
    if (!id) return
    runAction(id, () => sendJson(`/api/cyber/quarantine/${encodeURIComponent(id)}/rescan`, {}))
  }

  function handleCreateSuppression() {
    if (!suppressionDraft.scopeValue || !suppressionDraft.rationale) {
      cyberError = 'Scope value and rationale are required.'
      return
    }
    runAction('suppression-create', async () => {
      await sendJson('/api/cyber/suppressions', suppressionDraft)
      suppressionDraft = { ...suppressionDraft, scopeValue: '', rationale: '', rollbackPath: '', expiresAt: '' }
    })
  }

  function handleRevokeSuppression(item) {
    const id = item.suppressionId ?? item.id
    if (!id) return
    runAction(id, () => sendJson(`/api/cyber/suppressions/${encodeURIComponent(id)}/revoke`, { reason: 'Operator revoke' }))
  }
</script>

<section data-view-panel="cyber-ops" class="view-panel panel">
  <header class="mw-view-header">
    <h1>Cyber Operations</h1>
    <p>Analyst workflow across incidents, evidence, quarantine actions, and suppressions.</p>
  </header>

  {#if cyberError}
    <div class="cyber-banner cyber-banner-error">{cyberError}</div>
  {/if}
  {#if cyberNotice}
    <div class="cyber-banner cyber-banner-notice">{cyberNotice}</div>
  {/if}

  <!-- ── Status ──────────────────────────────────────────────── -->
  <article class="panel">
    <div class="panel-head">
      <h2 class="panel-title">Status</h2>
      <span class="chip">{status ? 'live' : 'loading'}</span>
    </div>
    <div class="cyber-status-grid">
      {#each [
        ['Context-Wall', status?.providers?.contextWall?.reachable, status?.providers?.contextWall?.reason],
        ['Cyber-Proxy', status?.providers?.cyberProxy?.reachable, status?.providers?.cyberProxy?.reason],
        ['MCP-Proxy', status?.providers?.mcpProxy?.reachable, status?.providers?.mcpProxy?.reason],
        ['Evidence Store', status?.security?.evidenceStore?.available, status?.security?.evidenceStore?.mode],
        ['Quarantine Store', status?.security?.quarantineStore?.available, status?.security?.quarantineStore?.storagePath],
        ['Scan Provider', !(status?.scanning?.degraded), status?.scanning?.provider],
      ] as [label, ok, detail]}
        <div class="cyber-status-card">
          <p class="cyber-status-label">{label}</p>
          <span class="chip" class:chip-ok={ok} class:chip-degraded={!ok}>{ok ? 'ready' : 'degraded'}</span>
          <p class="cyber-status-detail">{detail || '--'}</p>
        </div>
      {/each}
    </div>
    <div class="cyber-metrics-grid">
      <div class="cyber-status-card">
        <p class="cyber-status-label">Blocked / scanned</p>
        <p class="cyber-metric">{status?.recent?.blockedCount ?? 0} / {status?.recent?.scannedCount ?? 0}</p>
      </div>
      <div class="cyber-status-card">
        <p class="cyber-status-label">Open incidents</p>
        <p class="cyber-metric">{status?.security?.incidents?.open ?? incidents.length}</p>
      </div>
      <div class="cyber-status-card">
        <p class="cyber-status-label">Severe open</p>
        <p class="cyber-metric">{status?.security?.incidents?.severeOpen ?? severeOpenIncidents.length}</p>
      </div>
      <div class="cyber-status-card">
        <p class="cyber-status-label">Quarantine backlog</p>
        <p class="cyber-metric">{status?.security?.quarantineStore?.backlog ?? quarantine.length}</p>
        <p class="cyber-status-detail">{degradedSecurityMessage(status) || 'all critical security dependencies reachable'}</p>
      </div>
    </div>
  </article>

  <!-- ── Policies ────────────────────────────────────────────── -->
  <article class="panel">
    <div class="panel-head">
      <h2 class="panel-title">Policies</h2>
    </div>
    <div class="cyber-policies-grid">
      <div class="cyber-status-card">
        <p class="cyber-policy-label">Network policy</p>
        <pre class="cyber-pre">{JSON.stringify({
          allowedDomains: policies?.allowedDomains,
          blockedDomains: policies?.blockedDomains,
          toolAllowedDomains: policies?.toolAllowedDomains,
          allowLocalTargets: policies?.allowLocalTargets,
          allowedLocalHosts: policies?.allowedLocalHosts,
        }, null, 2)}</pre>
      </div>
      <div class="cyber-status-card">
        <p class="cyber-policy-label">Download policy</p>
        <pre class="cyber-pre">{JSON.stringify({
          scanProvider: policies?.scanProvider,
          quarantineEnabled: policies?.quarantineEnabled,
          maxResponseBytes: policies?.maxResponseBytes,
          fileDownloadGating: policies?.fileDownloadGating,
        }, null, 2)}</pre>
      </div>
    </div>
  </article>

  <!-- ── Incident Queue ──────────────────────────────────────── -->
  <article class="panel">
    <div class="panel-head">
      <h2 class="panel-title">Incident Queue</h2>
      <span class="chip">{incidents.length}</span>
    </div>
    {#if incidents.length === 0}
      <p class="empty-row">No incidents are open in the current scope.</p>
    {:else}
      {#each incidents as incident (incident.incidentId ?? incident.id)}
        {@const id = incident.incidentId ?? incident.id}
        <div class="cyber-item-card">
          <div class="cyber-item-header">
            <strong>{incident.title || id}</strong>
            <span class="chip" style="background: var(--color-{incidentColor(incident)})">{incident.severity || 'RISK_SEVERITY_LOW'}</span>
            <span class="chip">{incident.state || 'new'}</span>
            <span class="chip">{incident.priority || 'medium'}</span>
          </div>
          <div class="cyber-item-meta">
            <p>{incident.summary || '--'}</p>
            <p>owner={keyText(incident, 'ownerId')} evidence={Array.isArray(incident.evidenceIds) ? incident.evidenceIds.length : 0} case={keyText(incident, 'linkedCaseId')}</p>
            <p>traceId={keyText(incident.correlation || {}, 'traceId')} sessionId={keyText(incident.correlation || {}, 'sessionId')} runId={keyText(incident.correlation || {}, 'runId')}</p>
          </div>
          <div class="cyber-item-actions">
            <button type="button" class="action-btn" disabled={busyId === id} on:click={() => handleAssign(incident)}>Assign</button>
            <button type="button" class="action-btn" disabled={busyId === id} on:click={() => handleStateChange(incident)}>Change state</button>
            <button type="button" class="action-btn" disabled={busyId === id} on:click={() => handleNote(incident)}>Add note</button>
          </div>
        </div>
      {/each}
    {/if}
  </article>

  <!-- ── Download Scans ──────────────────────────────────────── -->
  <article class="panel">
    <div class="panel-head">
      <h2 class="panel-title">Download Scans</h2>
      <span class="chip">{filteredDownloads.length}</span>
    </div>
    <div class="cyber-filters-row">
      <input class="input" placeholder="Source" bind:value={filterSource} />
      <input class="input" placeholder="Verdict" bind:value={filterVerdict} />
      <input class="input" placeholder="Provider" bind:value={filterProvider} />
    </div>
    {#if filteredDownloads.length === 0}
      <p class="empty-row">No download or artifact scan records matched the current filters.</p>
    {:else}
      {#each filteredDownloads as item (item.id)}
        <div class="cyber-item-card">
          <div class="cyber-item-header">
            <strong>{item.filename || item.id}</strong>
            <span class="chip" style="background: var(--color-{scanColor(item.scan)})">{scanLabel(item.scan)}</span>
            <span class="chip">{item.scan?.provider || 'unknown'}</span>
            <span class="chip">{item.source}</span>
          </div>
          <div class="cyber-item-meta">
            <p>status={item.scan?.status} blocked={boolText(Boolean(item.scan?.blocked))} quarantined={boolText(Boolean(item.scan?.quarantined))}</p>
            <p>runId={item.runId || '--'} sessionId={item.sessionId || '--'} traceId={item.traceId || '--'}</p>
            <p>contentType={item.contentType || '--'} size={item.sizeBytes || 0} createdAt={item.createdAt || '--'}</p>
            {#if item.url}<p>url={item.url}</p>{/if}
            {#if Array.isArray(item.scan?.reasons) && item.scan.reasons.length > 0}
              <p>reasons: {item.scan.reasons.join(' | ')}</p>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </article>

  <!-- ── Quarantine Objects ───────────────────────────────────── -->
  <article class="panel">
    <div class="panel-head">
      <h2 class="panel-title">Quarantine Objects</h2>
      <span class="chip">{quarantine.length}</span>
    </div>
    {#if quarantine.length === 0}
      <p class="empty-row">No quarantine objects are present in the current scope.</p>
    {:else}
      {#each quarantine as item (item.quarantineId ?? item.id)}
        {@const id = item.quarantineId ?? item.id}
        <div class="cyber-item-card">
          <div class="cyber-item-header">
            <strong>{id}</strong>
            <span class="chip">{item.currentState || 'pending_review'}</span>
            <span class="chip">{item.reviewStatus || 'pending'}</span>
            <span class="chip">{item.classification || 'unknown'}</span>
          </div>
          <div class="cyber-item-meta">
            <p>evidenceId={keyText(item, 'evidenceId')} size={item.sizeBytes || 0} contentType={item.contentType || '--'}</p>
            <p>reviewedBy={keyText(item, 'reviewedBy')} reviewedAt={keyText(item, 'reviewedAt')}</p>
            <p>storagePath={keyText(item, 'storagePath')}</p>
          </div>
          <div class="cyber-item-actions">
            <button type="button" class="action-btn" disabled={busyId === id} on:click={() => handleReview(item, 'benign')}>Mark benign</button>
            <button type="button" class="action-btn" disabled={busyId === id} on:click={() => handleReview(item, 'malicious')}>Mark malicious</button>
            <button type="button" class="action-btn" disabled={busyId === id} on:click={() => handleRescan(item)}>Re-scan</button>
            <button type="button" class="action-btn" disabled={busyId === id} on:click={() => handleRelease(item)}>Release</button>
          </div>
        </div>
      {/each}
    {/if}
  </article>

  <!-- ── Suppressions ─────────────────────────────────────────── -->
  <article class="panel">
    <div class="panel-head">
      <h2 class="panel-title">Suppressions</h2>
      <span class="chip">{suppressions.length}</span>
    </div>
    <div class="cyber-suppression-layout">
      <div>
        {#if suppressions.length === 0}
          <p class="empty-row">No active suppressions are configured.</p>
        {:else}
          {#each suppressions as item (item.suppressionId ?? item.id)}
            {@const id = item.suppressionId ?? item.id}
            <div class="cyber-item-card">
              <div class="cyber-item-header">
                <strong>{item.scopeType}:{item.scopeValue}</strong>
                <span class="chip">{item.status || 'active'}</span>
              </div>
              <div class="cyber-item-meta">
                <p>rationale={item.rationale || '--'}</p>
                <p>provider={keyText(item, 'provider')} tool={keyText(item, 'tool')} policyRule={keyText(item, 'policyRule')}</p>
                <p>approver={keyText(item, 'approver')} createdBy={keyText(item, 'createdBy')} expiresAt={keyText(item, 'expiresAt')}</p>
              </div>
              {#if item.status === 'active'}
                <div class="cyber-item-actions">
                  <button type="button" class="action-btn danger" disabled={busyId === id} on:click={() => handleRevokeSuppression(item)}>Revoke</button>
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
      <div>
        <div class="cyber-item-card">
          <p class="cyber-policy-label">Create suppression</p>
          <div class="cyber-form-stack">
            <select class="select" bind:value={suppressionDraft.scopeType}>
              {#each ['sha256', 'domain', 'url_pattern', 'tool', 'provider', 'policy_rule'] as opt}
                <option value={opt}>{opt}</option>
              {/each}
            </select>
            <input class="input" placeholder="Scope value" bind:value={suppressionDraft.scopeValue} />
            <textarea class="textarea" placeholder="Rationale" bind:value={suppressionDraft.rationale} rows="3"></textarea>
            <input class="input" placeholder="Rollback path" bind:value={suppressionDraft.rollbackPath} />
            <input class="input" placeholder="Provider (optional)" bind:value={suppressionDraft.provider} />
            <input class="input" placeholder="Tool (optional)" bind:value={suppressionDraft.tool} />
            <input class="input" placeholder="Policy rule (optional)" bind:value={suppressionDraft.policyRule} />
            <input class="input" placeholder="Expires at ISO8601 (optional)" bind:value={suppressionDraft.expiresAt} />
            <button type="button" class="action-btn primary" disabled={busyId === 'suppression-create'} on:click={handleCreateSuppression}>
              {busyId === 'suppression-create' ? 'Creating...' : 'Create Suppression'}
            </button>
          </div>
        </div>
      </div>
    </div>
  </article>
</section>

<style>
  .cyber-banner {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
    font-size: 0.875rem;
  }
  .cyber-banner-error {
    background: var(--color-rose, #fee2e2);
    color: var(--color-rose-text, #9f1239);
  }
  .cyber-banner-notice {
    background: var(--color-sky, #e0f2fe);
    color: var(--color-sky-text, #0c4a6e);
  }
  .cyber-status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.75rem;
    margin-top: 1rem;
  }
  .cyber-metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.75rem;
    margin-top: 1rem;
  }
  .cyber-status-card {
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 0.75rem;
    padding: 1rem;
  }
  .cyber-status-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted, #6b7280);
    margin-bottom: 0.5rem;
  }
  .cyber-status-detail {
    font-size: 0.75rem;
    color: var(--muted, #6b7280);
    margin-top: 0.5rem;
  }
  .cyber-metric {
    font-size: 1.25rem;
    font-weight: 600;
  }
  .cyber-policies-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-top: 1rem;
  }
  .cyber-policy-label {
    font-weight: 500;
    margin-bottom: 0.75rem;
  }
  .cyber-pre {
    font-size: 0.75rem;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--muted, #6b7280);
  }
  .cyber-filters-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .cyber-item-card {
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 0.75rem;
    padding: 1rem;
    margin-bottom: 0.75rem;
  }
  .cyber-item-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .cyber-item-meta {
    font-size: 0.75rem;
    color: var(--muted, #6b7280);
    margin-top: 0.5rem;
    line-height: 1.6;
  }
  .cyber-item-meta p {
    margin: 0;
  }
  .cyber-item-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .cyber-suppression-layout {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1.5rem;
  }
  .cyber-form-stack {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
  .chip-ok {
    background: var(--color-orange, #fed7aa);
  }
  .chip-degraded {
    background: var(--color-rose, #fecdd3);
  }
  @media (max-width: 768px) {
    .cyber-policies-grid,
    .cyber-suppression-layout {
      grid-template-columns: 1fr;
    }
    .cyber-filters-row {
      grid-template-columns: 1fr;
    }
  }
</style>
