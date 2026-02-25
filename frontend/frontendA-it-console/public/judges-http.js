(function (global) {
  const auth = global.MapleAuth;
  const FETCH_TIMEOUT_MS = 15000;
  const RETRY_BACKOFFS = [1000, 3000];

  async function readJson(response) {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (err) {
      console.warn("[maple-http] JSON parse failed for", response.url, err);
      return {};
    }
  }

  async function fetchWithRetry(url, options, retries) {
    const maxRetries = retries ?? (options?.method === "POST" ? 1 : 2);
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return response;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, RETRY_BACKOFFS[attempt] ?? 3000));
        }
      }
    }
    throw lastError;
  }

  async function fetchJson(path) {
    const response = await fetchWithRetry(path, {
      credentials: "include",
      headers: {
        ...(auth?.headersWithKey?.() ?? {}),
      },
    });

    const payload = await readJson(response);
    if (!response.ok) {
      const reason = payload?.reason ? ` (${payload.reason})` : "";
      throw new Error(`HTTP ${response.status}${reason}`);
    }

    return payload;
  }

  async function postJson(path, body) {
    const response = await fetchWithRetry(path, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(auth?.headersWithKey?.() ?? {}),
      },
      body: JSON.stringify(body ?? {}),
    }, 1);

    const payload = await readJson(response);
    if (!response.ok) {
      const reason =
        typeof payload?.error === "string"
          ? ` (${payload.error})`
          : payload?.reason
            ? ` (${payload.reason})`
            : "";
      throw new Error(`HTTP ${response.status}${reason}`);
    }

    return payload;
  }

  global.MapleHttp = {
    fetchJson,
    postJson,
  };
})(window);
