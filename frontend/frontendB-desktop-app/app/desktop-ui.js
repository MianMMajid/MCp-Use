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
  const openGatewayBtn = document.getElementById("openGatewayBtn");

  const defaultConfig = {
    gatewayUrl: "http://127.0.0.1:3000/judge",
    mode: "external",
    healthUrl: "http://127.0.0.1:3000/health",
  };

  const api = window.mapleDesktop ?? null;

  function setBadge(label, className) {
    statusBadge.textContent = label;
    statusBadge.className = `badge ${className}`.trim();
  }

  function renderConfig(config) {
    modeValue.textContent = config.mode ?? "-";
    gatewayValue.textContent = config.gatewayUrl ?? "-";
    healthValue.textContent = config.healthUrl ?? "-";
    gatewayFrame.src = config.gatewayUrl ?? "about:blank";
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
    }

    await refreshLogs();
  }

  refreshBtn.addEventListener("click", () => {
    refreshAll().catch((error) => {
      runtimeLogs.textContent = String(error?.message ?? error);
    });
  });

  startBtn.addEventListener("click", async () => {
    if (!api?.startRuntime) {
      return;
    }
    const response = await api.startRuntime();
    if (!response?.ok) {
      runtimeLogs.textContent = `Start failed: ${response?.error ?? "unknown error"}`;
    }
    await refreshAll();
  });

  stopBtn.addEventListener("click", async () => {
    if (!api?.stopRuntime) {
      return;
    }
    await api.stopRuntime();
    await refreshAll();
  });

  openGatewayBtn.addEventListener("click", async () => {
    const url = gatewayValue.textContent || defaultConfig.gatewayUrl;
    if (api?.openExternal) {
      await api.openExternal(url);
      return;
    }
    window.open(url, "_blank", "noopener");
  });

  refreshAll().catch((error) => {
    runtimeLogs.textContent = String(error?.message ?? error);
    setBadge("Initialization error", "danger");
  });

  setInterval(() => {
    refreshAll().catch(() => {
      // polling should be best effort only
    });
  }, 5000);
})();
