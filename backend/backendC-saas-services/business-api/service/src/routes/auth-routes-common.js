import { toPublicUser } from "../auth-session.js";

export function buildSessionAuthResponse(user, session) {
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
