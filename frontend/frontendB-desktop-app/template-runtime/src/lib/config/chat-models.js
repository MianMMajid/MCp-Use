/**
 * Multi-provider chat model registry.
 *
 * Backward-compatible: re-exports everything from openai-chat-models.js
 * and adds NVIDIA + Anthropic provider families.
 */

import {
  OPENAI_CHAT_MODEL_FAMILIES,
  CHAT_MODEL_OPTIONS as OPENAI_ONLY_OPTIONS,
  DEFAULT_CHAT_MODEL_SELECTION,
  CHAT_MODEL_STORAGE_KEY,
  LEGACY_CHAT_MODEL_STORAGE_KEY
} from './openai-chat-models.js';

// ── NVIDIA model families ───────────────────────────
const NVIDIA_CHAT_MODEL_FAMILIES = [
  {
    modelId: 'nvidia/nemotron-3-super-120b-a12b',
    title: 'Nemotron Super 120B',
    subtitle: 'Hybrid Mamba-Transformer MoE, 1M context, agentic reasoning',
    provider: 'nvidia',
    providerLabel: 'NVIDIA',
    efforts: [
      { id: 'standard', title: 'Standard', subtitle: 'Default Nemotron Super chat mode' }
    ]
  },
  {
    modelId: 'nvidia/llama-3.1-nemotron-70b-instruct',
    title: 'Nemotron 70B',
    subtitle: 'NVIDIA Nemotron 70B Instruct',
    provider: 'nvidia',
    providerLabel: 'NVIDIA',
    efforts: [
      { id: 'standard', title: 'Standard', subtitle: 'Default Nemotron 70B chat mode' }
    ]
  },
  {
    modelId: 'nvidia/nemotron-ultra-253b',
    title: 'Nemotron Ultra 253B',
    subtitle: 'NVIDIA Nemotron Ultra 253B flagship',
    provider: 'nvidia',
    providerLabel: 'NVIDIA',
    efforts: [
      { id: 'standard', title: 'Standard', subtitle: 'Default Nemotron Ultra chat mode' }
    ]
  }
];

// ── NemoClaw model families (self-hosted via NVIDIA NIM) ─
const NEMOCLAW_CHAT_MODEL_FAMILIES = [
  {
    modelId: 'nvidia/nemotron-3-super-120b-a12b',
    title: 'Nemotron Super 120B (Local)',
    subtitle: 'Self-hosted via NemoClaw sandbox with OpenShell security',
    provider: 'nemoclaw',
    providerLabel: 'NemoClaw',
    efforts: [
      { id: 'standard', title: 'Standard', subtitle: 'Local NIM inference — no data leaves your machine' }
    ]
  },
  {
    modelId: 'nvidia/llama-3.1-nemotron-70b-instruct',
    title: 'Nemotron 70B (Local)',
    subtitle: 'Self-hosted Nemotron 70B via NemoClaw',
    provider: 'nemoclaw',
    providerLabel: 'NemoClaw',
    efforts: [
      { id: 'standard', title: 'Standard', subtitle: 'Local NIM inference — privacy-first' }
    ]
  }
];

// ── Anthropic model families ────────────────────────
const ANTHROPIC_CHAT_MODEL_FAMILIES = [
  {
    modelId: 'claude-sonnet-4-6',
    title: 'Claude Sonnet 4.6',
    subtitle: 'Fast and capable Anthropic model',
    provider: 'anthropic',
    providerLabel: 'Anthropic',
    efforts: [
      { id: 'standard', title: 'Standard', subtitle: 'Default Sonnet chat mode' }
    ]
  },
  {
    modelId: 'claude-opus-4-6',
    title: 'Claude Opus 4.6',
    subtitle: 'Most capable Anthropic model',
    provider: 'anthropic',
    providerLabel: 'Anthropic',
    efforts: [
      { id: 'standard', title: 'Standard', subtitle: 'Default Opus chat mode' }
    ]
  }
];

// ── Annotate OpenAI families with provider ──────────
const OPENAI_ANNOTATED = OPENAI_CHAT_MODEL_FAMILIES.map((f) => ({
  ...f,
  provider: 'openai',
  providerLabel: 'OpenAI'
}));

// ── Combined registry ───────────────────────────────
export const CHAT_MODEL_FAMILIES = [
  ...OPENAI_ANNOTATED,
  ...NVIDIA_CHAT_MODEL_FAMILIES,
  ...NEMOCLAW_CHAT_MODEL_FAMILIES,
  ...ANTHROPIC_CHAT_MODEL_FAMILIES
];

export const CHAT_MODEL_OPTIONS = CHAT_MODEL_FAMILIES.flatMap((family) =>
  family.efforts.map((effort) => ({
    id: `${family.modelId}:${effort.id}`,
    modelId: family.modelId,
    modelTitle: family.title,
    title: `${family.title} · ${effort.title}`,
    subtitle: effort.subtitle,
    reasoningEffort: effort.id,
    reasoningTitle: effort.title,
    provider: family.provider,
    providerLabel: family.providerLabel
  }))
);

// ── Backward-compatible re-exports ──────────────────
export {
  OPENAI_CHAT_MODEL_FAMILIES,
  DEFAULT_CHAT_MODEL_SELECTION,
  CHAT_MODEL_STORAGE_KEY,
  LEGACY_CHAT_MODEL_STORAGE_KEY
};

function isSupportedMultiProviderSelection(modelId, reasoningEffort) {
  return CHAT_MODEL_OPTIONS.some(
    (option) => option.modelId === modelId && option.reasoningEffort === reasoningEffort
  );
}

export function normalizeChatModelSelection(value) {
  if (typeof value === 'string') {
    try {
      return normalizeChatModelSelection(JSON.parse(value));
    } catch {
      return { ...DEFAULT_CHAT_MODEL_SELECTION };
    }
  }

  const modelId = String(value?.modelId || '').trim();
  const reasoningEffort = String(value?.reasoningEffort || '').trim().toLowerCase();
  const provider = String(value?.provider || '').trim().toLowerCase();

  if (isSupportedMultiProviderSelection(modelId, reasoningEffort)) {
    const result = { modelId, reasoningEffort };
    if (provider) result.provider = provider;
    return result;
  }
  return { ...DEFAULT_CHAT_MODEL_SELECTION };
}

export function serializeChatModelSelection(selection) {
  const normalized = normalizeChatModelSelection(selection);
  return JSON.stringify(normalized);
}

export function getChatModelOption(selection) {
  const normalized = normalizeChatModelSelection(selection);
  if (normalized.provider) {
    const providerMatch = CHAT_MODEL_OPTIONS.find(
      (option) =>
        option.modelId === normalized.modelId &&
        option.reasoningEffort === normalized.reasoningEffort &&
        option.provider === normalized.provider
    );
    if (providerMatch) return providerMatch;
  }
  return (
    CHAT_MODEL_OPTIONS.find(
      (option) =>
        option.modelId === normalized.modelId &&
        option.reasoningEffort === normalized.reasoningEffort
    ) || CHAT_MODEL_OPTIONS[0]
  );
}

export function readStoredChatModelSelection(storage) {
  if (!storage) {
    return { ...DEFAULT_CHAT_MODEL_SELECTION };
  }
  const stored = storage.getItem(CHAT_MODEL_STORAGE_KEY);
  if (stored) {
    return normalizeChatModelSelection(stored);
  }
  const legacy = storage.getItem(LEGACY_CHAT_MODEL_STORAGE_KEY);
  if (legacy) {
    return normalizeChatModelSelection(legacy);
  }
  return { ...DEFAULT_CHAT_MODEL_SELECTION };
}

export function writeStoredChatModelSelection(storage, selection) {
  if (!storage) return;
  storage.setItem(CHAT_MODEL_STORAGE_KEY, serializeChatModelSelection(selection));
}
