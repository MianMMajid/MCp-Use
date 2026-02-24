import {
  toPublicUser,
  resolveSessionOwnerFingerprint,
} from "../auth.js";
import { dedupeBy } from "../helpers.js";

export function ownerScopesForSessionUser(userId: string): string[] {
  const userScoped = `user:${userId}`;
  const sessionScoped = resolveSessionOwnerFingerprint(userId);
  return dedupeBy([sessionScoped, userScoped], (entry) => entry);
}

export function buildSessionAuthResponse(user: any, session: any): Record<string, unknown> {
  return {
    ok: true,
    authenticated: true,
    method: "session",
    user: toPublicUser(user),
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
    },
  };
}
