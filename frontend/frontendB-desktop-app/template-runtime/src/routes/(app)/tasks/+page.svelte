<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import AppShell from '@/lib/components/AppShell.svelte';
  import ConfirmDialog from '@/lib/components/ConfirmDialog.svelte';
  import { loadJson, postJson, patchJson, deleteJson, invalidateCache } from '@/lib/api';
  import { toastStore } from '@/lib/stores/toast-store';

  let loading = true;
  let error = '';
  let tasks = [];
  let agents = [];
  let orchestrations = [];
  let firewallObjects = [];
  let nowTs = Date.now();
  let timer = null;
  let openMenuTaskId = '';

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
      const [taskData, agentData, orchestrationData, firewallData] = await Promise.all([
        loadJson('/api/tasks'),
        loadJson('/api/agents').catch(() => ({ items: [] })),
        loadJson('/api/orchestrations').catch(() => ({ items: [] })),
        loadJson('/api/firewalls').catch(() => ({ items: [] })),
      ]);
      tasks = taskData?.items || [];
      agents = agentData?.items || agentData || [];
      orchestrations = orchestrationData?.items || orchestrationData || [];
      firewallObjects = firewallData?.items?.filter((item) => !item?.archived) || [];

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

  onMount(async () => {
    await refresh();
    timer = setInterval(() => {
      nowTs = Date.now();
    }, 1000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  $: assignmentOptions = assignmentType === 'agent'
    ? (agents || []).map((item) => ({ value: String(item.agentId || item.id), label: item.name || item.id }))
    : (orchestrations || []).map((item) => ({ value: String(item.id), label: item.name || item.id }));

  $: if (!assignmentOptions.find((item) => item.value === assignmentId)) {
    assignmentId = assignmentOptions[0]?.value || '';
  }

  function statusClass(status) {
    const value = String(status || '').toLowerCase();
    if (value.includes('run')) return 'status running';
    if (value.includes('pause')) return 'status paused';
    if (value.includes('fail') || value.includes('error')) return 'status blocked';
    if (value.includes('schedule')) return 'status queued';
    return 'status queued';
  }

  function formatCountdown(targetIso) {
    if (!targetIso) return '--';
    const ms = new Date(targetIso).getTime() - nowTs;
    if (!Number.isFinite(ms)) return '--';
    if (ms <= 0) return 'due now';
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function progressPercent(task) {
    const intervalMs = Math.max(1, Number(task?.schedule?.intervalMinutes || 0)) * 60 * 1000;
    const next = task?.nextRunAt ? new Date(task.nextRunAt).getTime() : NaN;
    if (!Number.isFinite(next) || intervalMs <= 0) return 0;
    const elapsed = intervalMs - Math.max(0, next - nowTs);
    return Math.max(0, Math.min(100, Math.round((elapsed / intervalMs) * 100)));
  }

  function firewallForTask(task) {
    const assignment = task?.assignment || {};
    if (assignment.type === 'agent' && assignment.agentId) {
      const agentSpecific = firewallObjects.find(
        (item) => item.scope === 'agent' && String(item.assignedAgentId || '') === String(assignment.agentId)
      );
      if (agentSpecific) return agentSpecific;
    }
    return firewallObjects.find((item) => item.scope === 'global') || null;
  }

  function openFirewall(task) {
    const fw = firewallForTask(task);
    if (!fw) return;
    goto(`/firewalls?firewallId=${encodeURIComponent(fw.id)}`);
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
          : { orchestrationId: assignmentId },
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

  // Delete confirmation
  let confirmOpen = false;
  let confirmTaskId = '';
  let confirmTaskTitle = '';
  let deletingTask = false;

  function requestDeleteTask(taskId, title) {
    confirmTaskId = taskId;
    confirmTaskTitle = title || taskId;
    confirmOpen = true;
    openMenuTaskId = '';
  }

  async function removeTask(taskId) {
    if (deletingTask) return;
    deletingTask = true;
    try {
      await deleteJson(`/api/tasks/${taskId}`);
      invalidateCache('/api/tasks');
      toastStore.success('Task deleted');
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      toastStore.error(`Failed to delete task: ${error}`);
    } finally {
      deletingTask = false;
    }
  }
</script>

<AppShell>
  <section class="page">
    <section class="card section header">
      <h1>Task Builder</h1>
      <p class="muted">Define intent, schedule it, and route execution through agents or orchestrations.</p>
    </section>

    <section class="card section">
      <form class="builder" on:submit={createTask}>
        <div class="column intent">
          <h2>Intent</h2>
          <label>
            <span>Objective Title</span>
            <input bind:value={title} required placeholder="Weekly governance summary" />
          </label>
          <label>
            <span>Prompt / Objective</span>
            <textarea rows="7" bind:value={prompt} placeholder="Describe the full task objective, output format, and constraints..."></textarea>
          </label>
        </div>

        <div class="column schedule">
          <h2>Schedule</h2>
          <label>
            <span>🗓 Start At</span>
            <input type="datetime-local" bind:value={startAt} />
          </label>
          <label>
            <span>🗓 End At (optional)</span>
            <input type="datetime-local" bind:value={endAt} />
          </label>
          <label>
            <span>🕒 Timezone</span>
            <input bind:value={timezone} />
          </label>
          <div class="inline-2">
            <label>
              <span>⏱ Interval (min)</span>
              <input type="number" min="1" bind:value={intervalMinutes} required />
            </label>
            <label>
              <span>🔁 Max Repeats</span>
              <input type="number" min="1" bind:value={maxRepeats} required />
            </label>
          </div>
          <div class="inline-2">
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
            {creating ? 'Scheduling...' : 'Schedule Task'}
          </button>
        </div>
      </form>
      {#if error}<p class="error">{error}</p>{/if}
    </section>

    <section class="card section">
      <h2>Scheduled Tasks</h2>
      {#if loading}
        <p class="muted">Loading tasks...</p>
      {:else if tasks.length === 0}
        <div class="ghost-empty">
          <p>No tasks scheduled yet. Assign an objective to get started.</p>
        </div>
      {:else}
        <div class="task-grid">
          {#each tasks as task}
            {@const fw = firewallForTask(task)}
            <article class="task-card" class:menu-open={openMenuTaskId === task.id}>
              <div class="task-top">
                <div>
                  <p class="title">{task.title}</p>
                  <p class="prompt">{task.prompt || '--'}</p>
                </div>
                <span class={statusClass(task.status)}>{task.status || 'scheduled'}</span>
              </div>

              <div class="timeline">
                <div class="timeline-row">
                  <span>Next run in {formatCountdown(task.nextRunAt)}</span>
                  <span>{progressPercent(task)}%</span>
                </div>
                <div class="progress">
                  <span style={`width:${progressPercent(task)}%`}></span>
                </div>
              </div>

              <div class="meta-grid">
                <p><strong>Interval</strong> {task.schedule?.intervalMinutes || '--'}m</p>
                <p><strong>Repeats</strong> {task.schedule?.maxRepeats || '--'}</p>
                <p><strong>Timezone</strong> {task.schedule?.timezone || '--'}</p>
                <p><strong>Next</strong> {task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : '--'}</p>
              </div>

              <div class="task-foot">
                {#if fw}
                  <button class="shield" on:click={() => openFirewall(task)} title="Open linked firewall policy">
                    🛡 Firewall
                  </button>
                {:else}
                  <span class="shield muted-shield">🛡 No Firewall</span>
                {/if}

                <label class="assign">
                  <span>Target</span>
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

                <div class="menu-wrap">
                  <button class="menu-btn pill" on:click|stopPropagation={() => (openMenuTaskId = openMenuTaskId === task.id ? '' : task.id)}>⋯</button>
                  {#if openMenuTaskId === task.id}
                    <div class="menu">
                      <button on:click={() => {
                        const nextTitle = window.prompt('Task title', task.title || '');
                        if (nextTitle == null) return;
                        const nextPrompt = window.prompt('Task prompt/objective', task.prompt || '');
                        if (nextPrompt == null) return;
                        updateTask(task.id, { title: nextTitle, prompt: nextPrompt }).catch((err) => (error = err.message));
                        openMenuTaskId = '';
                      }}>Edit</button>
                      <button on:click={() => { commandTask(task.id, 'pause').catch((err) => (error = err.message)); openMenuTaskId = ''; }}>Pause</button>
                      <button on:click={() => { commandTask(task.id, 'resume').catch((err) => (error = err.message)); openMenuTaskId = ''; }}>Resume</button>
                      <button on:click={() => { commandTask(task.id, 'run-now').catch((err) => (error = err.message)); openMenuTaskId = ''; }}>Run Now</button>
                      <button class="danger-item" on:click={() => requestDeleteTask(task.id, task.title)}>Delete</button>
                    </div>
                  {/if}
                </div>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  </section>
</AppShell>

<ConfirmDialog
  bind:open={confirmOpen}
  title="Delete Task"
  message={`Are you sure you want to delete "${confirmTaskTitle}"? This action cannot be undone.`}
  confirmLabel="Delete"
  danger
  onConfirm={() => removeTask(confirmTaskId)}
/>

<svelte:window on:click={() => { if (openMenuTaskId) openMenuTaskId = ''; }} on:keydown={(e) => { if (e.key === 'Escape') openMenuTaskId = ''; }} />

<style>
  .page { min-height: calc(100svh - 92px); display: grid; gap: 10px; align-content: start; grid-template-rows: max-content max-content 1fr; }
  .section { padding: 13px; display: grid; gap: 10px; }
  .header {
    padding: 8px 11px;
    gap: 3px;
    align-content: start;
    align-self: start;
  }
  h1, h2 { margin: 0; }
  h1 { font-size: 1.02rem; font-weight: 700; }
  h2 { font-size: 0.98rem; }
  .muted { margin: 0; color: var(--muted); font-size: 12px; }

  .builder { display: grid; gap: 12px; grid-template-columns: 1.2fr 1fr; }
  .column { border: 1px solid var(--row-border); border-radius: 14px; background: var(--row-bg); padding: 10px; display: grid; gap: 8px; align-content: start; }
  label span { display: block; margin-bottom: 4px; color: var(--muted); font-size: 11px; }
  input, textarea, select {
    width: 100%;
    border: 1px solid var(--input-border);
    border-radius: 11px;
    background: var(--input-bg);
    color: var(--fg);
    padding: 8px 10px;
    outline: none;
  }
  textarea { resize: vertical; }
  .inline-2 { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; }
  .cta {
    width: fit-content;
    padding: 8px 12px;
    border-color: rgba(249,115,22,.62);
    background: linear-gradient(180deg, rgba(249,115,22,.28), rgba(249,115,22,.2));
    box-shadow: 0 0 0 6px rgba(249,115,22,.08);
    cursor: pointer;
  }
  .error { margin: 0; color: var(--warn); }

  .ghost-empty {
    min-height: 130px;
    border: 1px dashed var(--border);
    border-radius: 12px;
    background: var(--row-bg);
    display: grid;
    place-items: center;
    text-align: center;
    color: var(--muted);
    padding: 16px;
  }

  .task-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
  .task-card {
    border: 1px solid var(--row-border);
    border-radius: 14px;
    background: var(--btn-secondary-bg);
    padding: 10px;
    display: grid;
    gap: 9px;
    position: relative;
  }
  .task-card.menu-open { z-index: 10; }
  .task-top { display: flex; gap: 10px; justify-content: space-between; align-items: start; }
  .title { margin: 0; font-weight: 700; font-size: 14px; }
  .prompt { margin: 4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.35; }

  .status {
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 11px;
    border: 1px solid rgba(148,163,184,.3);
    background: var(--row-bg);
  }
  .status.running { color: var(--ok); border-color: var(--ok-border); background: var(--ok-soft); box-shadow: 0 0 0 6px var(--ok-soft); animation: pulse 1.6s infinite; }
  .status.paused { color: #9ca3af; border-color: rgba(107,114,128,.45); background: var(--row-bg); }
  .status.blocked { color: #fca5a5; border-color: rgba(251,113,133,.44); background: rgba(251,113,133,.16); }
  .status.queued { color: #fcd34d; border-color: rgba(245,158,11,.4); background: rgba(245,158,11,.14); }
  @keyframes pulse {
    50% { box-shadow: 0 0 0 2px rgba(16,185,129,.06); }
  }

  .timeline { display: grid; gap: 6px; }
  .timeline-row { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 11px; }
  .progress { height: 7px; border-radius: 999px; background: var(--row-bg); overflow: hidden; }
  .progress span { display: block; height: 100%; background: linear-gradient(90deg, rgba(249,115,22,.85), rgba(245,158,11,.82)); }

  .meta-grid { display: grid; gap: 6px; grid-template-columns: repeat(2, minmax(120px, 1fr)); }
  .meta-grid p { margin: 0; font-size: 11px; color: var(--muted); }

  .task-foot { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: end; }
  .shield {
    border: 1px solid rgba(16,185,129,.35);
    border-radius: 999px;
    padding: 5px 8px;
    background: var(--ok-soft);
    color: var(--ok);
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }
  .muted-shield { border-color: rgba(107,114,128,.3); background: var(--row-bg); color: #9ca3af; cursor: default; }

  .assign { display: grid; gap: 4px; }
  .assign span { color: var(--muted); font-size: 10px; }
  .assign select { padding: 6px 8px; font-size: 12px; }

  .menu-wrap { position: relative; }
  .menu-btn { width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  .menu {
    position: absolute;
    right: 0;
    top: 36px;
    z-index: 8;
    min-width: 124px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--panel);
    padding: 4px;
    display: grid;
    gap: 2px;
  }
  .menu button {
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--fg);
    text-align: left;
    padding: 6px 8px;
    cursor: pointer;
    font-size: 12px;
  }
  .menu button:hover { background: var(--row-bg); }
  .menu .danger-item { color: #fda4af; }

  @media (max-width: 1080px) {
    .builder { grid-template-columns: 1fr; }
  }
</style>
