import { sessionCookieName } from "./config.js";
import type {
  MaplePostgresDatabase,
  MapleSessionWithUser,
  MapleUser,
} from "@maple/persistence";

export function parseCookieHeader(header?: string): Record<string, string> {
  if (!header) {
    return {};
  }
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.split("=");
    const name = rawName?.trim();
    if (!name) {
      continue;
    }
    const value = rawValue.join("=").trim();
    cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

export function sessionCookieValue(cookieHeader?: string): string | undefined {
  const cookies = parseCookieHeader(cookieHeader);
  const sessionId = cookies[sessionCookieName];
  return sessionId && sessionId.trim().length > 0 ? sessionId.trim() : undefined;
}

export function buildSessionCookie(sessionId: string, maxAgeSeconds: number): string {
  const parts = [
    `${sessionCookieName}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}`,
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function clearSessionCookieHeader(): string {
  const parts = [
    `${sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export async function findRequestSession(
  database: MaplePostgresDatabase,
  cookieHeader?: string,
): Promise<MapleSessionWithUser | undefined> {
  const sessionId = sessionCookieValue(cookieHeader);
  if (!sessionId) {
    return undefined;
  }
  return database.findActiveSession(sessionId);
}

export function toPublicUser(user: Pick<MapleUser, "id" | "username" | "email">) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
  };
}
