(function (global) {
  const auth = global.MapleAuth;

  async function readJson(response) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  async function fetchJson(path) {
    const response = await fetch(path, {
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
    const response = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(auth?.headersWithKey?.() ?? {}),
      },
      body: JSON.stringify(body ?? {}),
    });

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
