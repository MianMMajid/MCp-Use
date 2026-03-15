const OPENAI_REASONING_EFFORTS_BY_MODEL = {
  "gpt-5.4": new Set(["low", "medium", "high", "xhigh"]),
  "gpt-5.4-pro": new Set(["medium", "high", "xhigh"]),
};

const GENERIC_OPENAI_REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh"]);

export function inferProviderForModel(model) {
  const normalized = String(model ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith("gpt-") || normalized.startsWith("o1") || normalized.startsWith("o3") || normalized.startsWith("o4")) {
    return "openai";
  }
  if (normalized.startsWith("claude-")) {
    return "anthropic";
  }
  return null;
}

export function normalizeReasoningEffort(model, reasoningEffort) {
  const normalizedModel = String(model ?? "").trim().toLowerCase();
  const normalizedEffort = String(reasoningEffort ?? "").trim().toLowerCase();
  if (!normalizedEffort) return undefined;
  const supported = OPENAI_REASONING_EFFORTS_BY_MODEL[normalizedModel];
  if (supported) {
    return supported.has(normalizedEffort) ? normalizedEffort : undefined;
  }
  return GENERIC_OPENAI_REASONING_EFFORTS.has(normalizedEffort) ? normalizedEffort : undefined;
}
