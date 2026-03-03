(function () {
  const REQUIRED_IDS = [
    "statusBadge",
    "modeValue",
    "gatewayValue",
    "healthValue",
    "pidValue",
    "runtimeLogs",
    "fallbackBox",
    "bridgeWarning",
    "gatewayFrame",
    "refreshBtn",
    "startBtn",
    "restartBtn",
    "stopBtn",
    "openGatewayBtn",
    "updateBanner",
    "updateVersion",
    "updateBtn",
  ];
  const POLL_INTERVAL_MS = 15_000;
  const POLL_STOP_AFTER_MS = 30_000;

  const elements = {};
  const missingIds = [];
  for (const id of REQUIRED_IDS) {
    const el = document.getElementById(id);
    if (!el) {
      missingIds.push(id);
      continue;
    }
    elements[id] = el;
  }
  if (missingIds.length) {
    console.error("[desktop-ui] Missing required DOM elements:", missingIds.join(", "));
    return;
  }

  const desktop = window.mapleDesktop;
  const state = {
    config: {
      gatewayUrl: "http://127.0.0.1:3000/judge",
      mode: "managed",
      healthUrl: "http://127.0.0.1:3000/health",
    },
    pollTimer: null,
    connectionLostAt: 0,
    pollingStopped: false,
  };

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) {
      return fallback;
    }
    return String(value);
  }

  function setLogText(text) {
    elements.runtimeLogs.textContent = safeText(text, "");
  }

  function appendLog(line) {
    const current = safeText(elements.runtimeLogs.textContent, "").trim();
    elements.runtimeLogs.textContent = current ? `${current}\n${line}` : line;
  }

  function isSafeGatewayUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl, window.location.origin);
      return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
    } catch {
      return false;
    }
  }

  function setStatusBadge(text) {
    elements.statusBadge.textContent = text;
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function renderConfig() {
    const { gatewayUrl, mode, healthUrl } = state.config;
    elements.modeValue.textContent = safeText(mode, "managed");
    elements.gatewayValue.textContent = safeText(gatewayUrl);
    elements.healthValue.textContent = safeText(healthUrl);
    elements.gatewayFrame.setAttribute("src", isSafeGatewayUrl(gatewayUrl) ? gatewayUrl : "about:blank");
  }

  function renderStatus(status) {
    if (state.pollingStopped) {
      setStatusBadge("Connection lost (polling stopped)");
      elements.pidValue.textContent = "n/a";
      return;
    }
    if (state.connectionLostAt) {
      setStatusBadge("Connection lost");
      elements.pidValue.textContent = "n/a";
      return;
    }

    const running = status?.running === true;
    const healthy = status?.healthy === true;
    if (running && healthy) {
      setStatusBadge("Running + Healthy");
    } else if (running) {
      setStatusBadge("Running");
    } else if (healthy) {
      setStatusBadge("Healthy");
    } else {
      setStatusBadge("Stopped");
    }
    elements.pidValue.textContent = status?.pid ? String(status.pid) : "n/a";
  }

  async function refreshConfig() {
    if (typeof desktop?.getConfig === "function") {
      try {
        const nextConfig = await desktop.getConfig();
        state.config = {
          ...state.config,
          ...nextConfig,
        };
      } catch {
        // noop
      }
    }
    renderConfig();
  }

  async function refreshBridgeStatus() {
    if (typeof desktop?.getBridgeStatus !== "function") {
      return;
    }
    try {
      const bridgeStatus = await desktop.getBridgeStatus();
      if (bridgeStatus?.available === false) {
        elements.bridgeWarning.style.display = "block";
      }
    } catch {
      // noop
    }
  }

  function updateConnectionLossState() {
    if (!state.connectionLostAt) {
      state.connectionLostAt = Date.now();
      return;
    }
    if (Date.now() - state.connectionLostAt >= POLL_STOP_AFTER_MS) {
      state.pollingStopped = true;
      stopPolling();
    }
  }

  async function refreshStatus() {
    if (typeof desktop?.getStatus !== "function") {
      return;
    }
    try {
      const runtimeStatus = await desktop.getStatus();
      state.connectionLostAt = 0;
      state.pollingStopped = false;
      renderStatus(runtimeStatus);
    } catch {
      updateConnectionLossState();
      renderStatus(null);
    }
  }

  async function refreshLogs() {
    if (typeof desktop?.getLogs !== "function") {
      return;
    }
    try {
      const lines = await desktop.getLogs(200);
      if (Array.isArray(lines)) {
        setLogText(lines.join("\n"));
      }
    } catch {
      // noop
    }
  }

  async function refreshAll() {
    await Promise.all([refreshConfig(), refreshBridgeStatus(), refreshStatus(), refreshLogs()]);
  }

  async function onStartClick() {
    if (typeof desktop?.startRuntime !== "function") {
      return;
    }
    try {
      const response = await desktop.startRuntime();
      if (!response?.ok) {
        appendLog(`Start failed: ${response?.error || "unknown_error"}`);
        return;
      }
      await refreshAll();
    } catch (error) {
      appendLog(`Start error: ${error?.message || String(error)}`);
    }
  }

  async function onStopClick() {
    if (typeof desktop?.stopRuntime !== "function") {
      return;
    }
    try {
      await desktop.stopRuntime();
      await refreshAll();
    } catch (error) {
      appendLog(`Stop error: ${error?.message || String(error)}`);
    }
  }

  async function onRestartClick() {
    if (typeof desktop?.stopRuntime !== "function" || typeof desktop?.startRuntime !== "function") {
      return;
    }
    try {
      await desktop.stopRuntime();
    } catch {
      // keep going and attempt restart
    }
    setTimeout(async () => {
      try {
        await desktop.startRuntime();
        await refreshAll();
      } catch (error) {
        appendLog(`Restart error: ${error?.message || String(error)}`);
      }
    }, 500);
  }

  function onOpenGatewayClick() {
    const targetUrl = safeText(state.config.gatewayUrl);
    if (!isSafeGatewayUrl(targetUrl)) {
      return;
    }
    if (typeof desktop?.openExternal === "function") {
      void desktop.openExternal(targetUrl);
      return;
    }
    window.open(targetUrl, "_blank", "noopener");
  }

  function wireUpdateEvents() {
    if (typeof desktop?.onUpdateAvailable !== "function") {
      return;
    }
    desktop.onUpdateAvailable((info) => {
      const version = safeText(info?.version, "new");
      elements.updateBanner.style.display = "block";
      elements.updateVersion.textContent = `Version ${version} is ready.`;
    });
  }

  async function onUpdateClick() {
    if (typeof desktop?.downloadUpdate !== "function") {
      return;
    }
    elements.updateBtn.disabled = true;
    elements.updateBtn.textContent = "Installing...";
    try {
      const result = await desktop.downloadUpdate();
      if (!result?.ok) {
        appendLog(`Update failed: ${result?.error || "unknown_error"}`);
        elements.updateBtn.disabled = false;
        elements.updateBtn.textContent = "Install & Restart";
        return;
      }
      elements.updateBtn.textContent = "Restarting…";
    } catch (error) {
      appendLog(`Update error: ${error?.message || String(error)}`);
      elements.updateBtn.disabled = false;
      elements.updateBtn.textContent = "Install & Restart";
    }
  }

  function wireActions() {
    elements.refreshBtn.addEventListener("click", () => {
      void refreshAll();
    });
    elements.startBtn.addEventListener("click", () => {
      void onStartClick();
    });
    elements.stopBtn.addEventListener("click", () => {
      void onStopClick();
    });
    elements.restartBtn.addEventListener("click", () => {
      void onRestartClick();
    });
    elements.openGatewayBtn.addEventListener("click", onOpenGatewayClick);
    elements.updateBtn.addEventListener("click", () => {
      void onUpdateClick();
    });
  }

  function enterFallbackMode() {
    elements.fallbackBox.style.display = "block";
    elements.startBtn.disabled = true;
    elements.stopBtn.disabled = true;
    elements.restartBtn.disabled = true;
    setStatusBadge("Browser-shell mode");
    renderConfig();
  }

  wireActions();
  wireUpdateEvents();
  if (!desktop) {
    enterFallbackMode();
    return;
  }

  void refreshAll();
  state.pollTimer = setInterval(() => {
    void refreshStatus();
  }, POLL_INTERVAL_MS);
})();
