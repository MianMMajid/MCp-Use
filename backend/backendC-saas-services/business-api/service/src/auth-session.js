import { sessionCookieName, sessionCookieDomain } from "./config.js";

export function parseCookieHeader(header) {
  if (!header) {
    return {};
  }

  const cookies = {};
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.split("=");
    const name = rawName?.trim();
    if (!name) {
      continue;
    }
    const value = rawValue.join("=").trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

export function sessionCookieValue(cookieHeader) {
  const cookies = parseCookieHeader(cookieHeader);
  const sessionId = cookies[sessionCookieName];
  return sessionId && sessionId.trim().length > 0 ? sessionId.trim() : undefined;
}

export async function findRequestSession(database, cookieHeader) {
  const sessionId = sessionCookieValue(cookieHeader);
  if (!sessionId) {
    return undefined;
  }
  return database.findActiveSession(sessionId);
}

export function buildSessionCookie(sessionId, maxAgeSeconds) {
  const parts = [
    `${sessionCookieName}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}`,
  ];
  if (sessionCookieDomain) parts.push(`Domain=${sessionCookieDomain}`);
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function clearSessionCookieHeader() {
  const parts = [
    `${sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (sessionCookieDomain) parts.push(`Domain=${sessionCookieDomain}`);
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
  };
}
