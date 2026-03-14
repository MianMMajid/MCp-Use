import { dedupeBy } from "@maple/common";
import {
  primaryConfiguredApiKeyFingerprint,
  sessionOwnerScopeMode,
} from "./config.js";

export function resolveSessionOwnerFingerprint(userId) {
  const userScoped = `user:${userId}`;
  if (sessionOwnerScopeMode === "user") {
    return userScoped;
  }
  if (sessionOwnerScopeMode === "api_key_primary") {
    return primaryConfiguredApiKeyFingerprint ?? userScoped;
  }
  return primaryConfiguredApiKeyFingerprint ?? userScoped;
}

export function ownerScopesForSessionUser(userId) {
  const userScoped = `user:${userId}`;
  const sessionScoped = resolveSessionOwnerFingerprint(userId);
  return dedupeBy([sessionScoped, userScoped], (entry) => entry);
}
