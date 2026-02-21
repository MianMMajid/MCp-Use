(function (global) {
  const STORAGE_KEY = "maple_judge_api_key";
  const SESSION_KEY = "maple_authenticated";
  const AUTH_EVENT_KEY = "maple_auth_event";

  function normalizeApiKey(value) {
    if (typeof value !== "string") {
      return "";
    }
    return value.trim();
  }

  function resolveApiKeyFromSession() {
    const sessionKey = normalizeApiKey(sessionStorage.getItem(STORAGE_KEY));
    if (sessionKey) {
      return sessionKey;
    }

    const localKey = normalizeApiKey(localStorage.getItem(STORAGE_KEY));
    if (localKey) {
      sessionStorage.setItem(STORAGE_KEY, localKey);
      return localKey;
    }

    return "";
  }

  function headersWithKey() {
    const key = resolveApiKeyFromSession();
    if (!key) {
      return {};
    }
    return { "x-api-key": key };
  }

  function persistApiKey(rawKey) {
    const key = normalizeApiKey(rawKey);
    if (!key) {
      return "";
    }
    sessionStorage.setItem(STORAGE_KEY, key);
    localStorage.setItem(STORAGE_KEY, key);
    return key;
  }

  function emitAuthEvent(type) {
    try {
      localStorage.setItem(
        AUTH_EVENT_KEY,
        JSON.stringify({
          type: String(type || "unknown"),
          at: Date.now(),
        })
      );
    } catch {
      // ignore storage failures
    }
  }

  async function checkSession() {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "same-origin",
      });
      if (!response.ok) {
        sessionStorage.removeItem(SESSION_KEY);
        return false;
      }
      const payload = await response.json().catch(() => ({}));
      const authenticated = payload?.authenticated === true;
      if (authenticated) {
        sessionStorage.setItem(SESSION_KEY, "1");
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
      return authenticated;
    } catch {
      return false;
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      sessionStorage.removeItem(SESSION_KEY);
      emitAuthEvent("logout");
    }
  }

  global.MapleAuth = {
    STORAGE_KEY,
    SESSION_KEY,
    AUTH_EVENT_KEY,
    resolveApiKeyFromSession,
    headersWithKey,
    persistApiKey,
    checkSession,
    logout,
    emitAuthEvent,
  };
})(window);
