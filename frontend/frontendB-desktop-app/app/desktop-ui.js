(() => {
  const statusBadge = document.getElementById("statusBadge");
  const modeValue = document.getElementById("modeValue");
  const gatewayValue = document.getElementById("gatewayValue");
  const healthValue = document.getElementById("healthValue");
  const pidValue = document.getElementById("pidValue");
  const runtimeLogs = document.getElementById("runtimeLogs");
  const fallbackBox = document.getElementById("fallbackBox");
  const gatewayFrame = document.getElementById("gatewayFrame");

  const refreshBtn = document.getElementById("refreshBtn");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const restartBtn = document.getElementById("restartBtn");
  const openGatewayBtn = document.getElementById("openGatewayBtn");

  const requiredEls = { statusBadge, modeValue, gatewayValue, healthValue, pidValue, runtimeLogs, fallbackBox, gatewayFrame, refreshBtn, startBtn, stopBtn, restartBtn, openGatewayBtn };
  const missingEls = Object.entries(requiredEls).filter(([, el]) => !el).map(([name]) => name);
  if (missingEls.length > 0) {
    console.error("[desktop-ui] Missing required DOM elements:", missingEls.join(", "));
    return;
  }

  const allButtons = [refreshBtn, startBtn, stopBtn, restartBtn, openGatewayBtn].filter(Boolean);

  const DEFAULT_GATEWAY_HOST = "http://127.0.0.1:3000";
  const POLL_INTERVAL_MS = 5000;
  const RESTART_DELAY_MS = 500;

  const defaultConfig = {
    gatewayUrl: `${DEFAULT_GATEWAY_HOST}/judge`,
    mode: "external",
    healthUrl: `${DEFAULT_GATEWAY_HOST}/health`,
  };

  const api = window.mapleDesktop ?? null;
  const bridgeWarning = document.getElementById("bridgeWarning");
  let currentGatewayUrl = defaultConfig.gatewayUrl;
  let consecutivePollFailures = 0;

  function isSafeUrl(url) {
    if (typeof url !== "string") return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" || (parsed.protocol === "http:" && parsed.hostname === "127.0.0.1");
    } catch {
      return false;
    }
  }

  function setBadge(label, className) {
    statusBadge.textContent = label;
    statusBadge.className = `badge ${className}`.trim();
  }

  function setButtonsDisabled(disabled) {
    for (const btn of allButtons) {
      btn.disabled = disabled;
    }
  }

  function renderConfig(config) {
    modeValue.textContent = config.mode ?? "-";
    gatewayValue.textContent = config.gatewayUrl ?? "-";
    healthValue.textContent = config.healthUrl ?? "-";
    const targetUrl = config.gatewayUrl ?? "about:blank";
    currentGatewayUrl = targetUrl;
    gatewayFrame.src = isSafeUrl(targetUrl) ? targetUrl : "about:blank";
  }

  function renderStatus(status) {
    pidValue.textContent = status.pid ? String(status.pid) : "-";

    if (status.running && status.healthy) {
      setBadge("Running + Healthy", "ok");
      return;
    }
    if (status.running && !status.healthy) {
      setBadge("Running (health pending)", "warn");
      return;
    }
    if (!status.running && status.mode === "managed") {
      setBadge("Stopped (managed mode)", "danger");
      return;
    }
    setBadge("External mode", "");
  }

  async function refreshLogs() {
    if (!api?.getLogs) {
      runtimeLogs.textContent = "Log stream unavailable in browser shell mode.";
      return;
    }
    const lines = await api.getLogs(120);
    runtimeLogs.textContent = Array.isArray(lines) && lines.length > 0 ? lines.join("\n") : "No logs yet.";
    runtimeLogs.scrollTop = runtimeLogs.scrollHeight;
  }

  async function refreshAll() {
    const config = api?.getConfig ? await api.getConfig() : defaultConfig;
    renderConfig(config);

    if (api?.getStatus) {
      const status = await api.getStatus();
      renderStatus(status);
    } else {
      renderStatus({ mode: config.mode, running: false, healthy: false, pid: null });
      fallbackBox.style.display = "block";
      startBtn.disabled = true;
      stopBtn.disabled = true;
      if (restartBtn) restartBtn.disabled = true;
    }

    await refreshLogs();
  }

  refreshBtn.addEventListener("click", () => {
    setButtonsDisabled(true);
    refreshAll()
      .catch((error) => {
        runtimeLogs.textContent = String(error?.message ?? error);
      })
      .finally(() => setButtonsDisabled(false));
  });

  startBtn.addEventListener("click", async () => {
    if (!api?.startRuntime) return;
    setButtonsDisabled(true);
    try {
      const response = await api.startRuntime();
      if (!response?.ok) {
        runtimeLogs.textContent = `Start failed: ${response?.error ?? "unknown error"}`;
      }
      await refreshAll();
    } catch (err) {
      runtimeLogs.textContent = `Start error: ${err?.message ?? err}`;
    } finally {
      setButtonsDisabled(false);
    }
  });

  stopBtn.addEventListener("click", async () => {
    if (!api?.stopRuntime) return;
    setButtonsDisabled(true);
    try {
      await api.stopRuntime();
      await refreshAll();
    } catch (err) {
      runtimeLogs.textContent = `Stop error: ${err?.message ?? err}`;
    } finally {
      setButtonsDisabled(false);
    }
  });

  if (restartBtn) {
    restartBtn.addEventListener("click", async () => {
      if (!api?.stopRuntime || !api?.startRuntime) return;
      setButtonsDisabled(true);
      setBadge("Restarting\u2026", "warn");
      try {
        await api.stopRuntime();
        await new Promise((r) => setTimeout(r, RESTART_DELAY_MS));
        const response = await api.startRuntime();
        if (!response?.ok) {
          runtimeLogs.textContent = `Restart start-phase failed: ${response?.error ?? "unknown error"}`;
        }
        await refreshAll();
      } catch (err) {
        runtimeLogs.textContent = `Restart error: ${err?.message ?? err}`;
        setBadge("Restart failed", "danger");
      } finally {
        setButtonsDisabled(false);
      }
    });
  }

  openGatewayBtn.addEventListener("click", async () => {
    const url = currentGatewayUrl || defaultConfig.gatewayUrl;
    if (api?.openExternal) {
      await api.openExternal(url);
      return;
    }
    window.open(url, "_blank", "noopener");
  });

  // Check bridge availability on startup
  if (api?.getBridgeStatus) {
    api.getBridgeStatus().then((bridge) => {
      if (!bridge.available && bridgeWarning) {
        bridgeWarning.style.display = "block";
        setBadge("Bridge not installed", "danger");
      }
    }).catch(() => {});
  }

  refreshAll().catch((error) => {
    runtimeLogs.textContent = String(error?.message ?? error);
    setBadge("Initialization error", "danger");
  });

  const pollTimer = setInterval(() => {
    refreshAll()
      .then(() => {
        if (consecutivePollFailures > 0) {
          consecutivePollFailures = 0;
        }
      })
      .catch(() => {
        consecutivePollFailures++;
        if (consecutivePollFailures >= 10) {
          clearInterval(pollTimer);
          setBadge("Connection lost (polling stopped)", "danger");
        } else if (consecutivePollFailures >= 3) {
          setBadge("Connection lost", "danger");
        }
      });
  }, POLL_INTERVAL_MS);

  window.addEventListener("beforeunload", () => {
    clearInterval(pollTimer);
  });
})();
