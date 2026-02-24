import { sharedTraceStore } from "../state.js";

export function getCommunityBaselines(enabled = true): number[][] {
  if (!enabled) {
    return [];
  }
  return sharedTraceStore.getEmbeddingBaselines(250);
}
