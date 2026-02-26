import { describe, expect, it, vi } from "vitest";
import { jsonResponse, runBrowserScript } from "../setup/script-loader";

const AUTH_SCRIPT = "frontend/frontendA-it-console/public/judges-auth.js";
const STORAGE_KEY = "maple_judge_api_key";
const SESSION_KEY = "maple_authenticated";
const AUTH_EVENT_KEY = "maple_auth_event";

interface MapleAuthModule {
  STORAGE_KEY: string;
  SESSION_KEY: string;
  AUTH_EVENT_KEY: string;
  resolveApiKeyFromSession: () => string;
  headersWithKey: () => Record<string, string>;
  persistApiKey: (rawKey: unknown) => string;
  checkSession: () => Promise<boolean>;
  logout: () => Promise<void>;
  emitAuthEvent: (type: string) => void;
}

declare global {
  interface Window {
    MapleAuth?: MapleAuthModule;
  }
}

async function loadMapleAuth(): Promise<MapleAuthModule> {
  await runBrowserScript(AUTH_SCRIPT);
  if (!window.MapleAuth) {
    throw new Error("MapleAuth did not initialize.");
  }
  return window.MapleAuth;
}

describe("judges-auth.js", () => {
  it("returns empty headers when no API key is available", async () => {
    const auth = await loadMapleAuth();
    expect(auth.resolveApiKeyFromSession()).toBe("");
    expect(auth.headersWithKey()).toEqual({});
  });

  it("prefers the session API key over localStorage", async () => {
    sessionStorage.setItem(STORAGE_KEY, "  session-key  ");
    localStorage.setItem(STORAGE_KEY, "local-key");

    const auth = await loadMapleAuth();
    expect(auth.resolveApiKeyFromSession()).toBe("session-key");
    expect(auth.headersWithKey()).toEqual({ "x-api-key": "session-key" });
  });

  it("falls back to localStorage and hydrates sessionStorage", async () => {
    localStorage.setItem(STORAGE_KEY, " local-key ");

    const auth = await loadMapleAuth();
    expect(auth.resolveApiKeyFromSession()).toBe("local-key");
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe("local-key");
  });

  it("persistApiKey normalizes and stores key in both stores", async () => {
    const auth = await loadMapleAuth();

    expect(auth.persistApiKey("  test-key  ")).toBe("test-key");
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe("test-key");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("test-key");
  });

  it("persistApiKey ignores blank and non-string values", async () => {
    const auth = await loadMapleAuth();

    expect(auth.persistApiKey("    ")).toBe("");
    expect(auth.persistApiKey(undefined)).toBe("");
    expect(auth.persistApiKey(1234)).toBe("");

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("checkSession returns true for authenticated sessions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ authenticated: true }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const auth = await loadMapleAuth();
    await expect(auth.checkSession()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", { credentials: "include" });
    expect(sessionStorage.getItem(SESSION_KEY)).toBe("1");
  });

  it("checkSession clears session marker when backend is not authenticated", async () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ authenticated: false }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const auth = await loadMapleAuth();
    await expect(auth.checkSession()).resolves.toBe(false);
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("checkSession clears local marker when request fails", async () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    const auth = await loadMapleAuth();
    await expect(auth.checkSession()).resolves.toBe(false);
    expect(sessionStorage.getItem(SESSION_KEY)).toBe("1");
  });

  it("logout clears local auth marker and emits logout event", async () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const auth = await loadMapleAuth();
    await auth.logout();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();

    const authEventRaw = localStorage.getItem(AUTH_EVENT_KEY);
    expect(authEventRaw).toBeTruthy();
    expect(JSON.parse(String(authEventRaw)).type).toBe("logout");
  });

  it("logout still clears marker and emits event when backend logout fails", async () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network failure")));

    const auth = await loadMapleAuth();
    await expect(auth.logout()).rejects.toThrow("network failure");
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();

    const authEventRaw = localStorage.getItem(AUTH_EVENT_KEY);
    expect(authEventRaw).toBeTruthy();
    expect(JSON.parse(String(authEventRaw)).type).toBe("logout");
  });

  it("emitAuthEvent swallows storage write failures", async () => {
    const auth = await loadMapleAuth();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(() => auth.emitAuthEvent("manual")).not.toThrow();
    expect(setItemSpy).toHaveBeenCalled();
  });
});
