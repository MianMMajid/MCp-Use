<script>
  export let executions = []
  export let selectedExecutionId = ''
  export let targetInput = ''
  export let traceQuery = ''
  export let sessionQuery = ''
  export let reason = ''
  export let busy = ''
  export let notice = ''
  export let error = ''
  export let showConfirmStop = false

  export let setTraceQuery = () => {}
  export let setSessionQuery = () => {}
  export let selectExecution = () => {}
  export let setTargetInput = () => {}
  export let setReason = () => {}
  export let pauseExecution = () => {}
  export let resumeExecution = () => {}
  export let openStopConfirm = () => {}
  export let cancelStopConfirm = () => {}
  export let confirmStop = () => {}

  $: filteredExecutions = executions.filter((execution) => {
    const traceMatch = !traceQuery || String(execution.executionId ?? '').toLowerCase().includes(traceQuery.toLowerCase())
    const sessionMatch = !sessionQuery || String(execution.sessionId ?? '').toLowerCase().includes(sessionQuery.toLowerCase())
    return traceMatch && sessionMatch
  })

  $: activeExecution = executions.find((entry) => entry.executionId === selectedExecutionId) ?? null
  let manualTarget = ''
  $: if (!manualTarget && targetInput) manualTarget = targetInput
  $: targetValue = manualTarget || targetInput || activeExecution?.executionId || ''
</script>

<section>
  <h2>Audit & Compliance Operations</h2>
  <p>Intervene directly on Frontend B executions with stop, replay, and escalation controls.</p>
  <div class="control-grid">
    <article class="panel">
      <div class="panel-head">
        <h3 class="panel-title">Traces + Sessions</h3>
        <span class="source-badge">{filteredExecutions.length}</span>
      </div>
      <input class="input" placeholder="Search traces..." aria-label="Search traces" value={traceQuery} on:input={(e) => setTraceQuery(e.currentTarget.value)} />
      <input class="input" placeholder="Search sessions..." aria-label="Search sessions" value={sessionQuery} on:input={(e) => setSessionQuery(e.currentTarget.value)} />
      <div class="trace-list">
        {#if filteredExecutions.length === 0}<p>No traces loaded.</p>{/if}
        {#each filteredExecutions as execution}
          <button type="button" class="trace-item" class:active={selectedExecutionId === execution.executionId} on:click={() => selectExecution(execution.executionId)}>
            <strong>{execution.executionId}</strong>
            <span>{execution.sessionId ?? 'session-n/a'}</span>
          </button>
        {/each}
      </div>
    </article>

    <article class="panel">
      <div class="panel-head">
        <h3 class="panel-title">Intervention Command Bar</h3>
        <span class="source-badge">Source: Frontend B orchestration runtime</span>
      </div>
      <p>{activeExecution ? `Target: ${activeExecution.executionId}` : 'No trace/session target selected'}</p>
      <label>
        Trace or Session ID
        <input class="input" aria-label="Trace or Session ID" bind:value={manualTarget} on:input={() => setTargetInput(manualTarget)} />
      </label>
      <label>
        Reason
        <textarea class="textarea" aria-label="Reason" value={reason} on:input={(e) => setReason(e.currentTarget.value)} placeholder="Explain why this intervention is required."></textarea>
      </label>
      <div class="actions">
        <button type="button" class="action-btn" on:click={() => pauseExecution(targetValue)} disabled={busy !== '' || !targetValue}>Pause</button>
        <button type="button" class="action-btn" on:click={() => resumeExecution(targetValue)} disabled={busy !== '' || !targetValue}>Resume</button>
        <button type="button" class="action-btn danger" on:click={openStopConfirm} disabled={busy !== '' || !targetValue}>Stop</button>
      </div>
      {#if showConfirmStop}
        <div class="panel">
          <p>Confirm destructive action</p>
          <div class="actions">
            <button type="button" class="action-btn primary" on:click={() => confirmStop(targetValue)} disabled={!reason.trim() || busy !== ''}>Confirm</button>
            <button type="button" class="action-btn" on:click={cancelStopConfirm} disabled={busy !== ''}>Cancel</button>
          </div>
        </div>
      {/if}
      {#if notice}<p class="ok">{notice}</p>{/if}
      {#if error}<p class="err">{error}</p>{/if}
    </article>
  </div>
</section>
