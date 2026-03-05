<script>
  import { onMount } from 'svelte';
  import AppShell from '@/lib/components/AppShell.svelte';
  import { loadJson, postJson, patchJson, deleteJson, invalidateCache } from '@/lib/api';

  let loading = true;
  let error = '';
  let tasks = [];
  let agents = [];
  let orchestrations = [];

  let title = '';
  let prompt = '';
  let startAt = '';
  let endAt = '';
  let timezone = 'America/Los_Angeles';
  let intervalMinutes = 60;
  let maxRepeats = 8;
  let assignmentType = 'orchestration';
  let assignmentId = '';
  let creating = false;

  function toLocalDateTimeInput(date) {
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) return '';
    const pad = (num) => String(num).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  }

  function fromLocalDateTimeInput(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  async function refresh() {
    loading = true;
    error = '';
    try {
      const [taskData, agentData, orchestrationData] = await Promise.all([
        loadJson('/api/tasks'),
        loadJson('/api/agents').catch(() => ({ items: [] })),
        loadJson('/api/orchestrations').catch(() => ({ items: [] }))
      ]);
      tasks = taskData?.items || [];
      agents = agentData?.items || agentData || [];
      orchestrations = orchestrationData?.items || orchestrationData || [];
      if (!assignmentId) {
        assignmentId = assignmentType === 'agent'
          ? String(agents[0]?.agentId || agents[0]?.id || '')
          : String(orchestrations[0]?.id || '');
      }
      if (!startAt) {
        startAt = toLocalDateTimeInput(new Date(Date.now() + 5 * 60 * 1000));
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  onMount(refresh);

  $: assignmentOptions = assignmentType === 'agent'
    ? (agents || []).map((item) => ({ value: String(item.agentId || item.id), label: item.name || item.id }))
    : (orchestrations || []).map((item) => ({ value: String(item.id), label: item.name || item.id }));

  $: if (!assignmentOptions.find((item) => item.value === assignmentId)) {
    assignmentId = assignmentOptions[0]?.value || '';
  }

  async function createTask(event) {
    event.preventDefault();
    creating = true;
    error = '';
    try {
      const payload = {
        title,
        prompt,
        schedule: {
          startAt: fromLocalDateTimeInput(startAt) || new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          endAt: fromLocalDateTimeInput(endAt) || null,
          timezone,
          intervalMinutes: Number(intervalMinutes),
          maxRepeats: Number(maxRepeats),
        },
        assignment: assignmentType === 'agent'
          ? { agentId: assignmentId }
          : { orchestrationId: assignmentId }
      };
      const response = await postJson('/api/tasks', payload);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || `Failed to create task (${response.status})`);
      }
      title = '';
      prompt = '';
      endAt = '';
      invalidateCache('/api/tasks');
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      creating = false;
    }
  }

  async function assignTask(taskId, nextType, nextId) {
    const payload = nextType === 'agent' ? { agentId: nextId } : { orchestrationId: nextId };
    const response = await postJson(`/api/tasks/${taskId}/assign`, payload);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to assign task');
    invalidateCache('/api/tasks');
    await refresh();
  }

  async function commandTask(taskId, command) {
    const response = await postJson(`/api/tasks/${taskId}/${command}`, {});
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) throw new Error(data?.error || `Failed to ${command}`);
    invalidateCache('/api/tasks');
    await refresh();
  }

  async function updateTask(taskId, updates) {
    const response = await patchJson(`/api/tasks/${taskId}`, updates);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to update task');
    invalidateCache('/api/tasks');
    await refresh();
  }

  async function removeTask(taskId) {
    await deleteJson(`/api/tasks/${taskId}`);
    invalidateCache('/api/tasks');
    await refresh();
  }
</script>

<AppShell>
  <section class="page">
    <div class="card section">
      <h1>Task Builder</h1>
      <p class="muted">Create timed tasks and assign them to an orchestration or agent.</p>

      <form class="builder" on:submit={createTask}>
        <label>
          <span>Title</span>
          <input bind:value={title} required />
        </label>
        <label>
          <span>Prompt / Objective</span>
          <textarea rows="2" bind:value={prompt}></textarea>
        </label>
        <label>
          <span>Start At</span>
          <input type="datetime-local" bind:value={startAt} />
        </label>
        <label>
          <span>End At (optional)</span>
          <input type="datetime-local" bind:value={endAt} />
        </label>
        <label>
          <span>Timezone</span>
          <input bind:value={timezone} />
        </label>
        <label>
          <span>Interval (minutes)</span>
          <input type="number" min="1" bind:value={intervalMinutes} required />
        </label>
        <label>
          <span>Max repeats</span>
          <input type="number" min="1" bind:value={maxRepeats} required />
        </label>

        <div class="assign-row">
          <label>
            <span>Assign Type</span>
            <select bind:value={assignmentType}>
              <option value="orchestration">Orchestration</option>
              <option value="agent">Agent</option>
            </select>
          </label>
          <label>
            <span>Assign Target</span>
            <select bind:value={assignmentId}>
              {#each assignmentOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>
        </div>

        <button class="pill cta" type="submit" disabled={creating || !title.trim() || !assignmentId}>
          {creating ? 'Creating...' : 'Create Task'}
        </button>
      </form>

      {#if error}<p class="error">{error}</p>{/if}
    </div>

    <div class="card section">
      <h2>Scheduled Tasks</h2>
      {#if loading}
        <p class="muted">Loading tasks...</p>
      {:else if tasks.length === 0}
        <p class="muted">No tasks yet.</p>
      {:else}
        <div class="list">
          {#each tasks as task}
            <article class="task">
              <div class="task-head">
                <p class="title-input">{task.title}</p>
                <span class="status">{task.status}</span>
              </div>
              <p class="prompt">{task.prompt || '--'}</p>

              <div class="meta-grid">
                <p><strong>Interval</strong> {task.schedule?.intervalMinutes || '--'}m</p>
                <p><strong>Max repeats</strong> {task.schedule?.maxRepeats || '--'}</p>
                <p><strong>Timezone</strong> {task.schedule?.timezone || '--'}</p>
                <p><strong>Ends</strong> {task.schedule?.endAt ? new Date(task.schedule.endAt).toLocaleString() : '--'}</p>
                <p><strong>Next run</strong> {task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : '--'}</p>
                <p><strong>Last run</strong> {task.lastRunAt ? new Date(task.lastRunAt).toLocaleString() : '--'}</p>
                <label class="assign">
                  <span>Assigned to</span>
                  <select
                    value={task.assignment?.type === 'agent' ? task.assignment?.agentId : task.assignment?.orchestrationId}
                    on:change={(event) => assignTask(task.id, task.assignment?.type || 'orchestration', event.currentTarget.value).catch((err) => (error = err.message))}
                  >
                    {#if task.assignment?.type === 'agent'}
                      {#each agents as item}
                        <option value={item.agentId || item.id}>{item.name || item.id}</option>
                      {/each}
                    {:else}
                      {#each orchestrations as item}
                        <option value={item.id}>{item.name || item.id}</option>
                      {/each}
                    {/if}
                  </select>
                </label>
              </div>

              <div class="row-actions">
                <button
                  class="pill"
                  on:click={() => {
                    const nextTitle = window.prompt('Task title', task.title || '');
                    if (nextTitle == null) return;
                    const nextPrompt = window.prompt('Task prompt/objective', task.prompt || '');
                    if (nextPrompt == null) return;
                    updateTask(task.id, { title: nextTitle, prompt: nextPrompt }).catch((err) => (error = err.message));
                  }}
                >Edit</button>
                <button class="pill" on:click={() => commandTask(task.id, 'pause').catch((err) => (error = err.message))}>Pause</button>
                <button class="pill" on:click={() => commandTask(task.id, 'resume').catch((err) => (error = err.message))}>Resume</button>
                <button class="pill" on:click={() => commandTask(task.id, 'run-now').catch((err) => (error = err.message))}>Run Now</button>
                <button class="pill danger" on:click={() => removeTask(task.id).catch((err) => (error = err.message))}>Delete</button>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </div>
  </section>
</AppShell>

<style>
  .page { min-height: calc(100svh - 24px); display: grid; gap: 12px; }
  .section { padding: 14px; }
  h1, h2 { margin: 0 0 8px; }
  h2 { font-size: 1rem; }
  .muted { margin: 0; color: var(--muted); }
  .builder { margin-top: 10px; display: grid; gap: 10px; }
  .assign-row { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
  label span { display: block; margin-bottom: 4px; color: var(--muted); font-size: 12px; }
  input, textarea, select {
    width: 100%;
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 12px;
    background: rgba(20,24,32,.72);
    color: var(--fg);
    padding: 9px 11px;
    outline: none;
  }
  textarea { resize: vertical; }
  .cta { width: fit-content; padding: 8px 12px; border-color: rgba(249,115,22,.5); background: rgba(249,115,22,.2); cursor: pointer; }
  .error { margin: 10px 0 0; color: #fecdd3; }
  .list { display: grid; gap: 10px; }
  .task { border: 1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 10px; background: rgba(14,18,24,.5); display: grid; gap: 8px; }
  .task-head { display: flex; gap: 8px; align-items: center; }
  .title-input { margin: 0; flex: 1; font-weight: 600; }
  .prompt { margin: 0; color: var(--muted); font-size: 13px; }
  .status { padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(249,115,22,.4); font-size: 11px; }
  .meta-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  .meta-grid p { margin: 0; font-size: 12px; color: var(--muted); }
  .assign { display: grid; gap: 4px; }
  .row-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .row-actions button { padding: 7px 10px; cursor: pointer; border-color: rgba(249,115,22,.35); background: rgba(23,28,37,.74); }
  .row-actions .danger { border-color: rgba(251,113,133,.4); background: rgba(251,113,133,.16); }
</style>
