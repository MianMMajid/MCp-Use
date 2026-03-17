import { get, writable } from 'svelte/store';
import { loadJson, postJson, invalidateCache } from '@/lib/api';
import {
  getOrchestrationConversation,
  listOrchestrations,
  postOrchestrationConversation
} from '@/lib/orchestrations-api';
import { readStoredChatModelSelection } from '@/lib/config/openai-chat-models.js';

const CHAT_MODE_KEY = 'mayple_chat_mode';
const STACK_MODE_KEY = 'mayple_stack_mode';
const ORCH_ID_KEY = 'mayple_orchestration_id';
const AGENT_ID_KEY = 'selectedAgentId';
const ORCH_PANEL_KEY = 'mayple_orchestration_dock_tab';
const VALID_PANELS = new Set(['controls', 'tasks', 'timeline', 'approvals', 'advanced']);

function normalizeMode(value) {
  return value === 'orchestration' ? 'orchestration' : 'agent';
}

function normalizeStackMode(value) {
  return value === 'backend' ? 'backend' : 'frontend';
}

function normalizePanel(value) {
  const panel = String(value || '').toLowerCase();
  return VALID_PANELS.has(panel) ? panel : 'tasks';
}

function readWorkspaceQuery() {
  if (typeof window === 'undefined') return {};
  const query = new URLSearchParams(window.location.search);
  return {
    mode: query.get('mode') || '',
    stack: query.get('stack') || '',
    orchestrationId: query.get('orchestrationId') || '',
    executionId: query.get('executionId') || '',
    panel: query.get('panel') || ''
  };
}

function writeWorkspaceQuery({ mode, stack, orchestrationId, executionId, panel }) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);

  if (mode) url.searchParams.set('mode', mode);
  else url.searchParams.delete('mode');

  if (stack) url.searchParams.set('stack', stack);
  else url.searchParams.delete('stack');

  if (orchestrationId) url.searchParams.set('orchestrationId', orchestrationId);
  else url.searchParams.delete('orchestrationId');

  if (executionId) url.searchParams.set('executionId', executionId);
  else url.searchParams.delete('executionId');

  if (panel) url.searchParams.set('panel', panel);
  else url.searchParams.delete('panel');

  window.history.replaceState({}, '', `${url.pathname}${url.search ? `?${url.searchParams.toString()}` : ''}${url.hash}`);
}

function createChatStore() {
  const initial = {
    initialized: false,
    storageHydrated: false,
    mode: 'agent',
    stackMode: 'frontend',
    chatTarget: 'agent',
    orchestrationPanelTab: 'tasks',
    orchestrationExecutionId: '',
    user: null,
    agents: [],
    selectedAgentId: '',
    selectedAgent: null,
    sessions: [],
    sessionsLoading: false,
    sessionId: '',
    messages: [],
    runError: '',
    streaming: false,
    orchestrations: [],
    orchestrationsLoading: false,
    selectedOrchestrationId: '',
    selectedOrchestration: null,
    orchestrationConversation: [],
    orchestrationError: '',
    busy: false
  };

  const { subscribe, update, set } = writable(initial);

  function patch(partial) {
    update((state) => ({ ...state, ...partial }));
  }

  async function loadUser() {
    try {
      const payload = await loadJson('/api/auth/me');
      patch({ user: payload?.user ?? payload ?? null });
    } catch {
      patch({ user: null });
    }
  }

  async function loadAgents() {
    const payload = await loadJson('/api/agents').catch(() => ({ items: [] }));
    const items = payload?.items ?? payload ?? [];
    patch({ agents: items });
    return items;
  }

  async function loadOrchestrationList() {
    patch({ orchestrationsLoading: true });
    const items = await listOrchestrations().catch(() => []);
    patch({ orchestrations: items, orchestrationsLoading: false });
    return items;
  }

  async function loadSessions(agentId) {
    patch({ sessionsLoading: true });
    if (!agentId) {
      patch({ sessions: [], sessionsLoading: false });
      return [];
    }
    const payload = await loadJson(`/api/agents/${agentId}/sessions`).catch(() => ({ items: [] }));
    const items = payload?.items ?? payload ?? [];
    patch({ sessions: items, sessionsLoading: false });
    return items;
  }

  async function loadOrchestrationConversationStore(orchestrationId) {
    if (!orchestrationId) {
      patch({ orchestrationConversation: [] });
      return [];
    }
    const payload = await getOrchestrationConversation(orchestrationId).catch(() => ({ items: [] }));
    const items = payload?.items ?? [];
    patch({ orchestrationConversation: items });
    return items;
  }

  async function initialize() {
    const state = get({ subscribe });
    if (state.initialized) return;

    let mode = 'agent';
    let stackMode = 'frontend';
    let orchestrationPanelTab = 'tasks';
    let orchestrationExecutionId = '';
    let selectedAgentId = '';
    let selectedOrchestrationId = '';

    if (typeof window !== 'undefined') {
      mode = normalizeMode(window.localStorage.getItem(CHAT_MODE_KEY));
      const storedStack = window.localStorage.getItem(STACK_MODE_KEY);
      stackMode = storedStack
        ? normalizeStackMode(storedStack)
        : (mode === 'orchestration' ? 'backend' : 'frontend');
      orchestrationPanelTab = normalizePanel(window.localStorage.getItem(ORCH_PANEL_KEY));
      selectedAgentId = window.localStorage.getItem(AGENT_ID_KEY) || '';
      selectedOrchestrationId = window.localStorage.getItem(ORCH_ID_KEY) || '';
      const query = readWorkspaceQuery();
      if (query.mode) mode = normalizeMode(query.mode);
      if (query.stack) stackMode = normalizeStackMode(query.stack);
      if (query.orchestrationId) selectedOrchestrationId = query.orchestrationId;
      if (query.executionId) orchestrationExecutionId = query.executionId;
      if (query.panel) orchestrationPanelTab = normalizePanel(query.panel);
    }

    patch({
      initialized: true,
      storageHydrated: true,
      mode,
      stackMode,
      chatTarget: mode,
      orchestrationPanelTab,
      orchestrationExecutionId,
      selectedAgentId,
      selectedOrchestrationId
    });
    await Promise.all([loadUser(), loadAgents(), loadOrchestrationList()]);

    const next = get({ subscribe });
    const agents = next.agents || [];
    const orchestrations = next.orchestrations || [];

    const resolvedAgentId = next.selectedAgentId || '';
    const resolvedOrchId = next.selectedOrchestrationId || String(orchestrations[0]?.id || '');

    patch({
      selectedAgentId: resolvedAgentId,
      selectedAgent: agents.find((a) => String(a.agentId || a.id) === String(resolvedAgentId)) || null,
      selectedOrchestrationId: resolvedOrchId,
      selectedOrchestration: orchestrations.find((o) => String(o.id) === String(resolvedOrchId)) || null
    });

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AGENT_ID_KEY, resolvedAgentId);
      window.localStorage.setItem(ORCH_ID_KEY, resolvedOrchId);
      window.localStorage.setItem(CHAT_MODE_KEY, mode);
      window.localStorage.setItem(STACK_MODE_KEY, stackMode);
      window.localStorage.setItem(ORCH_PANEL_KEY, orchestrationPanelTab);
      writeWorkspaceQuery({
        mode,
        stack: stackMode,
        orchestrationId: mode === 'orchestration' ? resolvedOrchId : '',
        executionId: orchestrationExecutionId,
        panel: mode === 'orchestration' ? orchestrationPanelTab : ''
      });

      // Guard against duplicate listeners on re-init
      if (!window.__mayple_popstate_bound) {
        window.__mayple_popstate_bound = true;
        window.addEventListener('popstate', () => {
        const current = get({ subscribe });
        const query = readWorkspaceQuery();
        const nextMode = query.mode ? normalizeMode(query.mode) : current.mode;
        const nextStack = query.stack ? normalizeStackMode(query.stack) : (nextMode === 'orchestration' ? 'backend' : 'frontend');
        const nextOrchestrationId = query.orchestrationId || current.selectedOrchestrationId;
        patch({
          mode: nextMode,
          stackMode: nextStack,
          chatTarget: nextMode,
          orchestrationPanelTab: query.panel ? normalizePanel(query.panel) : current.orchestrationPanelTab,
          orchestrationExecutionId: query.executionId || '',
          selectedOrchestrationId: nextOrchestrationId,
          selectedOrchestration: (current.orchestrations || []).find((item) => String(item.id) === String(nextOrchestrationId)) || null
        });
        });
      }
    }

    await Promise.all([
      loadSessions(resolvedAgentId),
      loadOrchestrationConversationStore(resolvedOrchId)
    ]);
  }

  async function selectAgent(agentId) {
    const nextId = String(agentId || '');
    const state = get({ subscribe });
    const selectedAgent = state.agents.find((a) => String(a.agentId || a.id) === nextId) || null;
    patch({
      selectedAgentId: nextId,
      selectedAgent,
      mode: 'agent',
      stackMode: 'frontend',
      chatTarget: 'agent',
      sessionId: '',
      messages: []
    });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AGENT_ID_KEY, nextId);
      window.localStorage.setItem(CHAT_MODE_KEY, 'agent');
      window.localStorage.setItem(STACK_MODE_KEY, 'frontend');
      writeWorkspaceQuery({
        mode: 'agent',
        stack: 'frontend',
        orchestrationId: '',
        executionId: '',
        panel: ''
      });
    }
    await loadSessions(nextId);
  }

  async function restoreSelectedAgent(agentId) {
    const nextId = String(agentId || '');
    const state = get({ subscribe });
    const selectedAgent = state.agents.find((a) => String(a.agentId || a.id) === nextId) || null;
    patch({
      selectedAgentId: nextId,
      selectedAgent,
      mode: 'agent',
      stackMode: 'frontend',
      chatTarget: 'agent'
    });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AGENT_ID_KEY, nextId);
      window.localStorage.setItem(CHAT_MODE_KEY, 'agent');
      window.localStorage.setItem(STACK_MODE_KEY, 'frontend');
      writeWorkspaceQuery({
        mode: 'agent',
        stack: 'frontend',
        orchestrationId: '',
        executionId: '',
        panel: ''
      });
    }
    await loadSessions(nextId);
  }

  async function selectOrchestration(orchestrationId) {
    const nextId = String(orchestrationId || '');
    const state = get({ subscribe });
    const selectedOrchestration = state.orchestrations.find((o) => String(o.id) === nextId) || null;
    patch({
      selectedOrchestrationId: nextId,
      selectedOrchestration,
      mode: 'orchestration',
      stackMode: 'backend',
      chatTarget: 'orchestration'
    });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ORCH_ID_KEY, nextId);
      window.localStorage.setItem(CHAT_MODE_KEY, 'orchestration');
      window.localStorage.setItem(STACK_MODE_KEY, 'backend');
      const state = get({ subscribe });
      writeWorkspaceQuery({
        mode: 'orchestration',
        stack: 'backend',
        orchestrationId: nextId,
        executionId: state.orchestrationExecutionId || '',
        panel: state.orchestrationPanelTab || 'tasks'
      });
    }
    await loadOrchestrationConversationStore(nextId);
  }

  function setChatTarget(target) {
    const nextMode = target === 'orchestration' ? 'orchestration' : 'agent';
    const nextStack = nextMode === 'orchestration' ? 'backend' : 'frontend';
    patch({ chatTarget: nextMode, mode: nextMode, stackMode: nextStack });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CHAT_MODE_KEY, nextMode);
      window.localStorage.setItem(STACK_MODE_KEY, nextStack);
      const state = get({ subscribe });
      writeWorkspaceQuery({
        mode: nextMode,
        stack: nextStack,
        orchestrationId: nextMode === 'orchestration' ? state.selectedOrchestrationId : '',
        executionId: nextMode === 'orchestration' ? state.orchestrationExecutionId : '',
        panel: nextMode === 'orchestration' ? state.orchestrationPanelTab : ''
      });
    }
  }

  async function newSession() {
    patch({ sessionId: '', messages: [], runError: '' });
  }

  async function selectSession(sessionId) {
    const sid = String(sessionId || '');
    if (!sid) return;
    patch({ sessionId: sid, messages: [], runError: '' });
    try {
      const payload = await loadJson(`/api/openclaw/agent/sessions/${sid}`);
      const session = payload?.session ?? payload ?? {};
      const runs = Array.isArray(session.runs) ? session.runs : [];
      const reconstructed = [];
      for (const run of runs) {
        const runId = run.runId || run.id;
        if (!runId) continue;
        const detail = await loadJson(`/api/runs/${runId}`).catch(() => null);
        const runData = detail?.run ?? detail;
        if (runData?.input?.message) {
          reconstructed.push({ id: `in-${runId}`, role: 'user', content: runData.input.message, timestamp: runData.createdAt });
        }
        if (runData?.output?.reply) {
          reconstructed.push({ id: `out-${runId}`, role: 'agent', content: runData.output.reply, timestamp: runData.updatedAt, cost: runData.cost ?? null });
        }
      }
      patch({ messages: reconstructed });
    } catch {
      patch({ messages: [] });
    }
  }

  async function sendAgentMessage(text) {
    const content = String(text || '').trim();
    if (!content) return;

    const state = get({ subscribe });
    const fallbackAgentId = String(state.selectedAgentId || '');
    if (!fallbackAgentId) {
      return sendGlobalChatMessage(content);
    }

    patch({
      runError: '',
      busy: true,
      messages: [...state.messages, { id: `local-${Date.now()}`, role: 'user', content, timestamp: new Date().toISOString() }]
    });

    try {
      const response = await postJson(`/api/agents/${fallbackAgentId}/run`, {
        message: content,
        sessionId: state.sessionId || undefined
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || payload?.details || `Run failed (${response.status})`);
      }

      const next = get({ subscribe });
      patch({
        sessionId: state.sessionId || payload.sessionId || '',
        messages: [
          ...next.messages,
          {
            id: `reply-${Date.now()}`,
            role: 'agent',
            content: payload.reply ?? payload.output ?? '',
            timestamp: new Date().toISOString(),
            cost: payload.cost ?? null
          }
        ]
      });
      invalidateCache(`/api/agents/${fallbackAgentId}/sessions`);
      await loadSessions(fallbackAgentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const next = get({ subscribe });
      patch({
        runError: message,
        messages: [...next.messages, { id: `err-${Date.now()}`, role: 'agent', content: message, error: true, timestamp: new Date().toISOString() }]
      });
    } finally {
      patch({ busy: false });
    }
  }

  async function sendGlobalChatMessage(text) {
    const content = String(text || '').trim();
    if (!content) return;

    const state = get({ subscribe });
    patch({
      runError: '',
      busy: true,
      messages: [...state.messages, { id: `local-${Date.now()}`, role: 'user', content, timestamp: new Date().toISOString() }]
    });

    try {
      const modelSelection = typeof window !== 'undefined'
        ? readStoredChatModelSelection(window.localStorage)
        : readStoredChatModelSelection(null);
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content }],
          model: modelSelection.modelId,
          reasoningEffort: modelSelection.reasoningEffort
        })
      });

      if (!response.ok) {
        throw new Error(`Global chat failed (${response.status})`);
      }

      let reply = '';
      const replyId = `reply-${Date.now()}`;
      const replyTs = new Date().toISOString();
      patch({ streaming: true });

      // Add placeholder message that will be updated as chunks arrive
      const beforeStream = get({ subscribe });
      patch({
        messages: [...beforeStream.messages, { id: replyId, role: 'assistant', content: '', timestamp: replyTs }]
      });

      const reader = response.body?.getReader?.();
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() || '';
          for (const block of blocks) {
            const line = block
              .split('\n')
              .find((entry) => entry.startsWith('data:'));
            if (!line) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const parsed = JSON.parse(payload);
              reply += parsed?.content || parsed?.delta || '';
            } catch {
              reply += payload;
            }
          }
          // Update the streaming message in-place with accumulated content
          update((s) => ({
            ...s,
            messages: s.messages.map((m) => m.id === replyId ? { ...m, content: reply } : m)
          }));
        }
      } else {
        reply = await response.text();
      }

      // Finalize the streamed message
      patch({ streaming: false });
      update((s) => ({
        ...s,
        messages: s.messages.map((m) => m.id === replyId
          ? { ...m, content: reply || 'No response received.' }
          : m
        )
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const next = get({ subscribe });
      patch({
        runError: message,
        messages: [...next.messages, { id: `err-${Date.now()}`, role: 'assistant', content: message, error: true, timestamp: new Date().toISOString() }]
      });
    } finally {
      patch({ busy: false });
    }
  }

  async function sendOrchestrationMessage(text) {
    const content = String(text || '').trim();
    if (!content) return;
    const state = get({ subscribe });
    const orchestrationId = String(state.selectedOrchestrationId || state.orchestrations[0]?.id || '');
    if (!orchestrationId) {
      patch({ orchestrationError: 'No orchestration selected.' });
      return;
    }

    const local = {
      id: `orch-local-${Date.now()}`,
      role: 'user',
      text: content,
      createdAt: new Date().toISOString()
    };

    patch({ orchestrationError: '', busy: true, orchestrationConversation: [...state.orchestrationConversation, local] });

    try {
      const payload = await postOrchestrationConversation(orchestrationId, { message: content });
      if (Array.isArray(payload?.items)) {
        patch({ orchestrationConversation: payload.items });
      } else if (payload?.reply) {
        const next = get({ subscribe });
        patch({
          orchestrationConversation: [
            ...next.orchestrationConversation,
            { id: `mgr-${Date.now()}`, role: 'manager', text: payload.reply, createdAt: new Date().toISOString() }
          ]
        });
      }
      invalidateCache(`/api/orchestrations/${orchestrationId}/conversation`);
    } catch (error) {
      patch({ orchestrationError: error instanceof Error ? error.message : String(error) });
    } finally {
      patch({ busy: false });
    }
  }

  async function sendMessage(text) {
    const state = get({ subscribe });
    if (state.chatTarget === 'orchestration') {
      return sendOrchestrationMessage(text);
    }
    if (state.selectedAgentId) return sendAgentMessage(text);
    return sendGlobalChatMessage(text);
  }

  function setOrchestrationPanelTab(panel) {
    const nextPanel = normalizePanel(panel);
    patch({ orchestrationPanelTab: nextPanel });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ORCH_PANEL_KEY, nextPanel);
      const state = get({ subscribe });
      writeWorkspaceQuery({
        mode: state.mode,
        stack: state.stackMode,
        orchestrationId: state.mode === 'orchestration' ? state.selectedOrchestrationId : '',
        executionId: state.mode === 'orchestration' ? state.orchestrationExecutionId : '',
        panel: state.mode === 'orchestration' ? nextPanel : ''
      });
    }
  }

  function setOrchestrationExecutionId(executionId) {
    const nextId = String(executionId || '');
    patch({ orchestrationExecutionId: nextId });
    if (typeof window !== 'undefined') {
      const state = get({ subscribe });
      writeWorkspaceQuery({
        mode: state.mode,
        stack: state.stackMode,
        orchestrationId: state.mode === 'orchestration' ? state.selectedOrchestrationId : '',
        executionId: state.mode === 'orchestration' ? nextId : '',
        panel: state.mode === 'orchestration' ? state.orchestrationPanelTab : ''
      });
    }
  }

  return {
    subscribe,
    initialize,
    selectAgent,
    restoreSelectedAgent,
    selectOrchestration,
    setChatTarget,
    setOrchestrationPanelTab,
    setOrchestrationExecutionId,
    newSession,
    selectSession,
    sendMessage,
    sendAgentMessage,
    sendGlobalChatMessage,
    sendOrchestrationMessage,
    fetchAgents: loadAgents,
    fetchOrchestrations: loadOrchestrationList,
  };
}

export const chatStore = createChatStore();
