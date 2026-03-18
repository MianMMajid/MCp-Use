<script>
  import { onMount } from 'svelte'

  import { loadMany, sendJson, pickItems } from '../api/maple-api.js'
  import { humanizeError } from '../utils/error-display.js'

  const REQUESTS = Object.freeze([
    ['leakageDocuments', '/api/firewall/context-leakage/documents'],
    ['leakageEntities', '/api/firewall/context-leakage/entities?activeOnly=false'],
    ['leakageEvents', '/api/firewall/context-leakage/events?limit=100'],
  ])

  let loading = true
  let error = ''
  let notice = ''
  let busy = ''
  let state = {}
  let leakagePolicyMode = 'strict'
  let leakageInlineText = ''
  let leakageInlineName = 'context-policy.txt'
  let leakageFileInput
  let selectedEntityId = ''

  $: documents = pickItems(state.leakageDocuments?.value)
  $: entities = pickItems(state.leakageEntities?.value)
  $: events = pickItems(state.leakageEvents?.value)
  $: if (!selectedEntityId && entities.length > 0) {
    selectedEntityId = entities[0].entityId
  }
  $: selectedEntity = entities.find((item) => item.entityId === selectedEntityId) ?? null
  $: filteredEvents = selectedEntityId
    ? events.filter((item) => Array.isArray(item.entityIds) && item.entityIds.includes(selectedEntityId))
    : events

  async function refresh() {
    loading = true
    error = ''
    try {
      state = await loadMany(fetch, REQUESTS)
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      loading = false
    }
  }

  async function runAction(key, operation) {
    busy = key
    error = ''
    notice = ''
    try {
      await operation()
      await refresh()
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      busy = ''
    }
  }

  async function handleUpload() {
    busy = 'upload'
    error = ''
    notice = ''
    try {
      const formData = new FormData()
      formData.append('policyMode', leakagePolicyMode)
      if (leakageInlineText.trim()) {
        formData.append('name', leakageInlineName || 'context-policy.txt')
        formData.append('text', leakageInlineText)
      }
      const files = leakageFileInput?.files ? Array.from(leakageFileInput.files) : []
      for (const file of files) formData.append('documents', file)
      const response = await fetch('/api/firewall/context-leakage/documents', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `/api/firewall/context-leakage/documents -> ${response.status}`)
      }
      leakageInlineText = ''
      if (leakageFileInput) leakageFileInput.value = ''
      notice = `Stored ${payload?.documents?.length ?? 0} context document(s).`
      await refresh()
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      busy = ''
    }
  }

  async function deleteDocument(documentId) {
    await runAction(`delete:${documentId}`, async () => {
      const response = await fetch(`/api/firewall/context-leakage/documents/${encodeURIComponent(documentId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `DELETE context leakage document -> ${response.status}`)
      }
      notice = 'Context document deleted.'
    })
  }

  async function updateEntity(entityId, body) {
    await runAction(`entity:${entityId}`, async () => {
      await sendJson(fetch, `/api/firewall/context-leakage/entities/${encodeURIComponent(entityId)}/mode`, body)
      notice = 'Entity settings updated.'
    })
  }

  function formatDate(value) {
    if (!value) return '--'
    try {
      return new Date(value).toLocaleString()
    } catch {
      return String(value)
    }
  }

  onMount(() => {
    refresh()
    const onShellRefresh = () => refresh()
    window.addEventListener('maple:shell-refresh', onShellRefresh)
    const intervalId = window.setInterval(refresh, 20000)
    return () => {
      window.removeEventListener('maple:shell-refresh', onShellRefresh)
      window.clearInterval(intervalId)
    }
  })
</script>

<section class="policy-page">
  <header class="surface-header">
    <div>
      <span class="surface-kicker">Firewalls</span>
      <h1>Policy Center</h1>
      <p>Insert protected context, inspect extracted entities, and follow how those entities rewrite or block governed traffic.</p>
    </div>
    <button type="button" class="surface-refresh" on:click={refresh} disabled={loading}>Refresh</button>
  </header>

  {#if error}<p class="surface-error">{humanizeError(error)}</p>{/if}
  {#if notice}<p class="surface-notice">{notice}</p>{/if}

  <section class="policy-story">
    <article class="story-step">
      <span>1. Intake</span>
      <strong>Upload or paste sensitive context</strong>
    </article>
    <div class="story-link">→</div>
    <article class="story-step">
      <span>2. Extraction</span>
      <strong>{entities.length} protected entities active</strong>
    </article>
    <div class="story-link">→</div>
    <article class="story-step">
      <span>3. Enforcement</span>
      <strong>{events.length} rewrite / block events</strong>
    </article>
  </section>

  <section class="policy-grid">
    <article class="surface-panel intake-panel">
      <div class="panel-head">
        <h2>Context intake</h2>
        <span class="chip">{leakagePolicyMode}</span>
      </div>
      <label>
        <span>Mode</span>
        <select class="select" bind:value={leakagePolicyMode}>
          <option value="strict">strict</option>
          <option value="review">review</option>
          <option value="monitor">monitor</option>
        </select>
      </label>
      <label>
        <span>Inline doc name</span>
        <input class="input" bind:value={leakageInlineName} />
      </label>
      <label>
        <span>Policy text</span>
        <textarea class="editor" bind:value={leakageInlineText} placeholder="Avoid: My address: 2788 San Tomas Expy, Santa Clara, CA 95051"></textarea>
      </label>
      <label>
        <span>Upload documents</span>
        <input bind:this={leakageFileInput} type="file" multiple />
      </label>
      <div class="actions">
        <button type="button" class="action-btn primary" on:click={handleUpload} disabled={Boolean(busy)}>Store context</button>
      </div>
      <div class="docs-list">
        {#each documents as item}
          <article class="doc-card">
            <strong>{item.fileName ?? item.documentId}</strong>
            <span>{item.policyMode ?? 'strict'} · {formatDate(item.createdAt)}</span>
            <button type="button" class="link-action" on:click={() => deleteDocument(item.documentId)} disabled={Boolean(busy)}>Delete</button>
          </article>
        {/each}
        {#if documents.length === 0}
          <p class="empty-row">No context documents stored yet.</p>
        {/if}
      </div>
    </article>

    <article class="surface-panel entity-panel">
      <div class="panel-head">
        <h2>Protected entities</h2>
        <span class="chip">{entities.length}</span>
      </div>
      <div class="entity-list">
        {#if entities.length === 0}
          <p class="empty-row">Entities appear here after upload.</p>
        {:else}
          {#each entities as item}
            <button type="button" class="entity-card" class:active={item.entityId === selectedEntityId} on:click={() => { selectedEntityId = item.entityId }}>
              <strong>{item.displayText ?? item.category}</strong>
              <span>{item.category} · {item.action ?? 'block'} · {item.replacementValue || '--'}</span>
            </button>
          {/each}
        {/if}
      </div>
      {#if selectedEntity}
        <div class="entity-actions">
          <select class="select" value={selectedEntity.policyMode ?? 'strict'} on:change={(event) => updateEntity(selectedEntity.entityId, { policyMode: event.currentTarget.value })}>
            <option value="strict">strict</option>
            <option value="review">review</option>
            <option value="monitor">monitor</option>
          </select>
          <button type="button" class="action-btn" on:click={() => updateEntity(selectedEntity.entityId, { isActive: !(selectedEntity.isActive ?? true) })} disabled={Boolean(busy)}>
            {selectedEntity.isActive === false ? 'Activate' : 'Deactivate'}
          </button>
        </div>
      {/if}
    </article>

    <article class="surface-panel event-panel">
      <div class="panel-head">
        <h2>Enforcement story</h2>
        <span class="chip">{filteredEvents.length}</span>
      </div>
      <div class="event-stack">
        {#if filteredEvents.length === 0}
          <p class="empty-row">No rewrite or block events for the selected entity yet.</p>
        {:else}
          {#each filteredEvents as item}
            <article class="event-card">
              <div class="event-head">
                <strong>{item.action} · {item.direction || 'prompt'}</strong>
                <span>{item.blocked ? 'blocked' : 'continued'}</span>
              </div>
              <p>session={item.sessionId || '--'} · run={item.runId || '--'} · tool={item.toolName || '--'}</p>
              <div class="event-columns">
                <div>
                  <span>Original</span>
                  <pre>{item.originalRedactedText || '--'}</pre>
                </div>
                <div>
                  <span>Sanitized</span>
                  <pre>{item.sanitizedText || item.reason || '--'}</pre>
                </div>
              </div>
            </article>
          {/each}
        {/if}
      </div>
    </article>
  </section>
</section>

<style>
  .policy-page { display:grid; gap:24px; }
  .surface-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
  .surface-kicker { display:block; text-transform:uppercase; letter-spacing:0.16em; font-size:0.72rem; color:#7a6f67; margin-bottom:8px; }
  .surface-header h1 { margin:0; font-size:2rem; }
  .surface-header p { margin:8px 0 0; color:#6f6b67; max-width:780px; }
  .surface-refresh { border:1px solid #e4d8cd; background:#fff; border-radius:999px; padding:0.8rem 1.2rem; font:inherit; }
  .surface-error,.surface-notice { margin:0; }
  .surface-error { color:#b74b4b; }
  .surface-notice { color:#99620d; }
  .policy-story { display:flex; align-items:center; gap:12px; overflow:auto; padding-bottom:4px; }
  .story-step { min-width:220px; border:1px solid #eadfd5; background:#fff; border-radius:24px; padding:1rem 1.1rem; box-shadow:0 18px 36px rgba(113,79,45,0.08); }
  .story-step span { display:block; text-transform:uppercase; letter-spacing:0.12em; font-size:0.72rem; color:#8a7b70; margin-bottom:6px; }
  .story-link { color:#d28b3f; font-size:1.2rem; }
  .policy-grid { display:grid; grid-template-columns: minmax(320px, 0.9fr) minmax(280px, 0.75fr) minmax(0, 1.15fr); gap:20px; }
  .surface-panel { background:#fff; border:1px solid #eadfd5; border-radius:28px; padding:1.1rem; box-shadow:0 18px 36px rgba(113,79,45,0.08); }
  .panel-head { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:1rem; }
  .panel-head h2 { margin:0; font-size:1.15rem; }
  .chip { border:1px solid #e4d8cd; border-radius:999px; padding:0.3rem 0.7rem; font-size:0.8rem; background:#fffaf5; color:#7a6f67; }
  label { display:grid; gap:6px; margin-bottom:12px; }
  label span { font-size:0.78rem; letter-spacing:0.08em; text-transform:uppercase; color:#8a7b70; }
  .input, .select, .editor { width:100%; border:1px solid #eadfd5; border-radius:18px; background:#fffaf7; padding:0.85rem 0.95rem; font:inherit; }
  .editor { min-height:180px; resize:vertical; }
  .actions, .entity-actions { display:flex; gap:10px; flex-wrap:wrap; }
  .actions { margin-bottom:14px; }
  .action-btn, .link-action { border:1px solid #e4d8cd; background:#fff; border-radius:999px; padding:0.7rem 1.1rem; font:inherit; }
  .action-btn.primary { background:#ef9f38; color:#fff; border-color:#ef9f38; }
  .docs-list, .entity-list, .event-stack { display:grid; gap:10px; }
  .doc-card, .entity-card, .event-card { border:1px solid #eadfd5; background:#fffaf7; border-radius:20px; padding:0.95rem; }
  .doc-card { display:grid; gap:6px; }
  .link-action { justify-self:start; padding:0.45rem 0.9rem; }
  .entity-card { text-align:left; font:inherit; }
  .entity-card.active { border-color:#ef9f38; box-shadow:0 0 0 3px rgba(239,159,56,0.16); background:#fff4e8; }
  .entity-card span, .doc-card span { color:#6f6b67; }
  .event-card { background:#fff; }
  .event-head { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:8px; }
  .event-card p { margin:0 0 10px; color:#6f6b67; }
  .event-columns { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; }
  .event-columns span { display:block; text-transform:uppercase; letter-spacing:0.12em; font-size:0.72rem; color:#8a7b70; margin-bottom:6px; }
  .event-columns pre { margin:0; background:#1f1914; color:#f9f3ec; border-radius:16px; padding:0.9rem; font-size:0.8rem; white-space:pre-wrap; overflow:auto; }
  .empty-row { margin:0; color:#6f6b67; }
  @media (max-width: 1180px) {
    .policy-grid, .event-columns { grid-template-columns:1fr; }
  }
</style>
