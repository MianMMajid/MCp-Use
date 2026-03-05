<script>
  import { docsByPath } from '$lib/svelte-docs/content.js'

  export let view = 'overview'
  export let routePath = '/maple/observability'
  export let endpoints = []
  export let routeRecord = null
  export let runtimeCapabilities = []

  const LEGACY_DOC_LINKS = Object.entries(docsByPath).map(([path, doc]) => ({
    label: doc?.title ?? path,
    href: path,
  }))

  const INCIDENT_FLOW = [
    'Pause execution to stop blast radius',
    'Inspect trace + topology + approval queue',
    'Retry node or replay from node',
    'Resume or cancel with explicit reason',
    'Escalate + step-up when required',
  ]
</script>

{#if view === 'overview'}
  <section class="view-panel docs-view">
    <header class="mw-view-header">
      <h1>Docs: Overview</h1>
      <p>Frontend B authors/executes orchestrations. Frontend A is the monitoring and intervention command center.</p>
    </header>
    <div class="docs-grid">
      <article class="panel docs-panel">
        <div class="panel-head">
          <h2 class="panel-title">Role Split</h2>
          <span class="chip">core model</span>
        </div>
        <ul class="mw-simple-list">
          <li><strong>Frontend B</strong>: authoring, agent chats, orchestration execution.</li>
          <li><strong>Frontend A</strong>: monitoring, triage, pause/resume/stop intervention.</li>
          <li><strong>Boundary</strong>: monitoring context is B-origin runtime only.</li>
        </ul>
      </article>
      <article class="panel docs-panel">
        <div class="panel-head">
          <h2 class="panel-title">Legacy Frontend A Docs Index</h2>
          <span class="chip">{LEGACY_DOC_LINKS.length}</span>
        </div>
        <div class="docs-links-grid">
          {#each LEGACY_DOC_LINKS as item}
            <a class="docs-link-card" href={item.href}>{item.label}</a>
          {/each}
        </div>
      </article>
    </div>
  </section>
{:else if view === 'api'}
  <section class="view-panel docs-view">
    <header class="mw-view-header">
      <h1>Docs: API</h1>
      <p>Operational endpoint inventory for monitoring, intervention, policy, and integrations.</p>
    </header>
    <div class="docs-grid">
      <article class="panel docs-panel">
        <div class="panel-head">
          <h2 class="panel-title">Workspace Endpoints</h2>
          <span class="chip">{endpoints.length}</span>
        </div>
        <div class="table-wrap">
          <table class="timeline-table">
            <thead><tr><th>Endpoint</th><th>Domain</th></tr></thead>
            <tbody>
              {#each endpoints as endpoint}
                <tr>
                  <td class="mono">{endpoint}</td>
                  <td>{endpoint.includes('/api/orchestrations') ? 'Intervention' : endpoint.includes('/api/observability') ? 'Monitoring' : endpoint.includes('/api/integrations') || endpoint.includes('/api/downstream') || endpoint.includes('/openclaw') ? 'Integrations' : 'General'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </article>
      <article class="panel docs-panel">
        <div class="panel-head">
          <h2 class="panel-title">Runtime Capabilities</h2>
          <span class="chip">{runtimeCapabilities.length}</span>
        </div>
        <ul class="mw-simple-list">
          {#each runtimeCapabilities as item}
            <li><span class="mono">{item.name ?? item.key ?? 'capability'}</span> - {item.enabled ? 'enabled' : 'disabled'}</li>
          {/each}
        </ul>
      </article>
    </div>
  </section>
{:else if view === 'runbooks'}
  <section class="view-panel docs-view">
    <header class="mw-view-header">
      <h1>Docs: Runbooks</h1>
      <p>Operational incident response and intervention decision flow.</p>
    </header>
    <div class="docs-grid">
      <article class="panel docs-panel">
        <div class="panel-head">
          <h2 class="panel-title">Incident Sequence</h2>
          <span class="chip">pause -> inspect -> recover</span>
        </div>
        <ol class="mw-simple-list">
          {#each INCIDENT_FLOW as step}
            <li>{step}.</li>
          {/each}
        </ol>
      </article>
      <article class="panel docs-panel">
        <div class="panel-head">
          <h2 class="panel-title">Action Semantics</h2>
        </div>
        <ul class="mw-simple-list">
          <li><code>pause</code>: freeze active execution while triaging.</li>
          <li><code>resume</code>: continue after approvals and safety checks.</li>
          <li><code>cancel</code>: destructive stop, requires reason + confirm.</li>
          <li><code>retry-node</code>: rerun same branch step.</li>
          <li><code>replay-from-node</code>: create and execute safe fork branch.</li>
        </ul>
      </article>
    </div>
  </section>
{:else}
  <section class="view-panel docs-view">
    <header class="mw-view-header">
      <h1>Docs: Route Help</h1>
      <p>Contextual help for the active route and related anchors/endpoints.</p>
    </header>
    <div class="docs-grid">
      <article class="panel docs-panel">
        <div class="panel-head">
          <h2 class="panel-title">Current Route</h2>
          <span class="chip">{routeRecord?.title ?? 'unknown'}</span>
        </div>
        <p><code>{routePath}</code></p>
        <p>{routeRecord?.description ?? 'No route metadata available.'}</p>
      </article>
      <article class="panel docs-panel">
        <div class="panel-head">
          <h2 class="panel-title">Route Anchors</h2>
          <span class="chip">{routeRecord?.anchors?.length ?? 0}</span>
        </div>
        <ul class="mw-simple-list">
          {#if !routeRecord?.anchors?.length}
            <li>No anchors registered.</li>
          {:else}
            {#each routeRecord.anchors as anchor}
              <li><span class="mono">#{anchor.id}</span> {anchor.title}</li>
            {/each}
          {/if}
        </ul>
      </article>
    </div>
  </section>
{/if}
