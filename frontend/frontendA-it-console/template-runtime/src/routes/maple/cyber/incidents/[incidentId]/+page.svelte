<script>
  import { onMount } from 'svelte'
  import { page } from '$app/stores'

  import { loadJson } from '../../../../../lib/api/maple-api.js'

  let detail = null
  let loading = true
  let error = ''

  $: incidentId = $page.params.incidentId

  async function refresh() {
    loading = true
    error = ''
    try {
      detail = await loadJson(fetch, `/api/cyber/incidents/${encodeURIComponent(incidentId)}`)
    } catch (requestError) {
      error = requestError instanceof Error ? requestError.message : String(requestError)
    } finally {
      loading = false
    }
  }

  onMount(refresh)
</script>

<header class="mw-view-header">
  <h1>Cyber Incident Detail</h1>
  <p>Operator drill-down for incident, evidence, and correlation context.</p>
</header>

<div class="actions">
  <a class="action-btn" href="/maple/cyber">Back to Cyber Operations</a>
  <button type="button" class="action-btn primary" disabled={loading} on:click={refresh}>
    {loading ? 'Refreshing...' : 'Refresh'}
  </button>
</div>

{#if error}
  <p class="mw-chat-error">{error}</p>
{/if}

<article class="panel">
  <div class="panel-head">
    <h2 class="panel-title">{detail?.item?.title ?? detail?.incident?.title ?? incidentId}</h2>
    <span class="chip">{incidentId}</span>
  </div>
  <pre class="mono panel-json">{JSON.stringify(detail ?? {}, null, 2)}</pre>
</article>

<style>
  .panel-json {
    max-height: 32rem;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
