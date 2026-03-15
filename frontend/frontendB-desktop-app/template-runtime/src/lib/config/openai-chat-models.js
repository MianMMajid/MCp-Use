export const CHAT_MODEL_STORAGE_KEY = 'mayple_chat_model_selection';
export const LEGACY_CHAT_MODEL_STORAGE_KEY = 'mayple_dummy_model';

export const OPENAI_CHAT_MODEL_FAMILIES = [
  {
    modelId: 'gpt-5.4',
    title: 'GPT-5.4',
    subtitle: 'General-purpose GPT-5.4 chat model',
    efforts: [
      { id: 'low', title: 'Low', subtitle: 'Fastest supported reasoning' },
      { id: 'medium', title: 'Medium', subtitle: 'Balanced reasoning' },
      { id: 'high', title: 'High', subtitle: 'Thinks longer for harder tasks' },
      { id: 'xhigh', title: 'XHigh', subtitle: 'Maximum supported reasoning' }
    ]
  },
  {
    modelId: 'gpt-5.4-pro',
    title: 'GPT-5.4 Pro',
    subtitle: 'Higher-capability GPT-5.4 Pro model',
    efforts: [
      { id: 'medium', title: 'Medium', subtitle: 'Balanced reasoning' },
      { id: 'high', title: 'High', subtitle: 'Thinks longer for harder tasks' },
      { id: 'xhigh', title: 'XHigh', subtitle: 'Maximum supported reasoning' }
    ]
  }
];

export const CHAT_MODEL_OPTIONS = OPENAI_CHAT_MODEL_FAMILIES.flatMap((family) =>
  family.efforts.map((effort) => ({
    id: `${family.modelId}:${effort.id}`,
    modelId: family.modelId,
    modelTitle: family.title,
    title: `${family.title} · ${effort.title}`,
    subtitle: effort.subtitle,
    reasoningEffort: effort.id,
    reasoningTitle: effort.title
  }))
);

export const DEFAULT_CHAT_MODEL_SELECTION = {
  modelId: 'gpt-5.4',
  reasoningEffort: 'high'
};

function isSupportedSelection(modelId, reasoningEffort) {
  return CHAT_MODEL_OPTIONS.some(
    (option) => option.modelId === modelId && option.reasoningEffort === reasoningEffort
  );
}

function migrateLegacySelection(value) {
  switch (String(value || '').trim().toLowerCase()) {
    case 'auto':
      return { modelId: 'gpt-5.4', reasoningEffort: 'medium' };
    case 'instant-53':
      return { modelId: 'gpt-5.4', reasoningEffort: 'low' };
    case 'thinking-52':
      return { modelId: 'gpt-5.4', reasoningEffort: 'high' };
    case 'pro-52':
      return { modelId: 'gpt-5.4-pro', reasoningEffort: 'high' };
    default:
      return null;
  }
}

export function normalizeChatModelSelection(value) {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return normalizeChatModelSelection(parsed);
    } catch {
      const migrated = migrateLegacySelection(value);
      return migrated || { ...DEFAULT_CHAT_MODEL_SELECTION };
    }
  }

  const modelId = String(value?.modelId || '').trim();
  const reasoningEffort = String(value?.reasoningEffort || '').trim().toLowerCase();
  if (isSupportedSelection(modelId, reasoningEffort)) {
    return { modelId, reasoningEffort };
  }
  return { ...DEFAULT_CHAT_MODEL_SELECTION };
}

export function getChatModelOption(selection) {
  const normalized = normalizeChatModelSelection(selection);
  return (
    CHAT_MODEL_OPTIONS.find(
      (option) =>
        option.modelId === normalized.modelId &&
        option.reasoningEffort === normalized.reasoningEffort
    ) || CHAT_MODEL_OPTIONS[0]
  );
}

export function serializeChatModelSelection(selection) {
  const normalized = normalizeChatModelSelection(selection);
  return JSON.stringify(normalized);
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
  const migrated = legacy ? migrateLegacySelection(legacy) : null;
  return migrated || { ...DEFAULT_CHAT_MODEL_SELECTION };
}

export function writeStoredChatModelSelection(storage, selection) {
  if (!storage) return;
  storage.setItem(CHAT_MODEL_STORAGE_KEY, serializeChatModelSelection(selection));
}
