import { describe, expect, it, vi } from "vitest";
import { flushPromises, runBrowserScript } from "../setup/script-loader";

const DESKTOP_UI_SCRIPT = "frontend/frontendB-desktop-app/app/desktop-ui.js";

interface DesktopApi {
  getConfig: () => Promise<{ gatewayUrl: string; mode: string; healthUrl: string }>;
  getBridgeStatus: () => Promise<{ available: boolean; error: string }>;
  getStatus: () => Promise<{ running: boolean; healthy: boolean; pid: number | null; mode: string }>;
  startRuntime: () => Promise<{ ok: boolean; error?: string }>;
  stopRuntime: () => Promise<{ ok: boolean; error?: string }>;
  getLogs: (limit?: number) => Promise<string[]>;
  openExternal: (url: string) => Promise<{ ok: boolean }>;
  onUpdateAvailable: (callback: (info: { version: string }) => void) => void;
  downloadUpdate: () => Promise<{ ok: boolean; error?: string }>;
}

declare global {
  interface Window {
    mapleDesktop?: Partial<DesktopApi>;
  }
}

function renderDesktopDom(): void {
  document.body.innerHTML = `
    <main>
      <span id="statusBadge" class="badge">Checking...</span>
      <span id="modeValue"></span>
      <code id="gatewayValue"></code>
      <code id="healthValue"></code>
      <span id="pidValue"></span>
      <div id="runtimeLogs"></div>
      <div id="fallbackBox" style="display:none"></div>
      <div id="bridgeWarning" style="display:none"></div>
      <iframe id="gatewayFrame"></iframe>
      <button type="button" id="refreshBtn">Refresh</button>
      <button type="button" id="startBtn">Start</button>
      <button type="button" id="restartBtn">Restart</button>
      <button type="button" id="stopBtn">Stop</button>
      <button type="button" id="openGatewayBtn">Open Gateway</button>
      <div id="updateBanner" style="display:none"></div>
      <span id="updateVersion"></span>
      <button type="button" id="updateBtn">Install & Restart</button>
    </main>
  `;
}

function createDesktopApi(overrides: Partial<DesktopApi> = {}): DesktopApi {
  return {
    getConfig: async () => ({
      gatewayUrl: "http://127.0.0.1:3000/judge",
      mode: "managed",
      healthUrl: "http://127.0.0.1:3000/health",
    }),
    getBridgeStatus: async () => ({ available: true, error: "" }),
    getStatus: async () => ({ running: true, healthy: true, pid: 1234, mode: "managed" }),
    startRuntime: async () => ({ ok: true }),
    stopRuntime: async () => ({ ok: true }),
    getLogs: async () => ["boot complete"],
    openExternal: async () => ({ ok: true }),
    onUpdateAvailable: () => undefined,
    downloadUpdate: async () => ({ ok: true }),
    ...overrides,
  };
}

async function loadDesktopUi(): Promise<void> {
  await runBrowserScript(DESKTOP_UI_SCRIPT);
  await flushPromises(6);
}

describe("desktop-ui.js", () => {
  it("logs and exits when required DOM elements are missing", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<main><span id="statusBadge"></span></main>`;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.mapleDesktop = createDesktopApi();

    await loadDesktopUi();

    expect(errorSpy).toHaveBeenCalledWith(
      "[desktop-ui] Missing required DOM elements:",
      expect.stringContaining("modeValue")
    );
  });

  it("renders runtime config, status, and logs from bridge API", async () => {
    vi.useFakeTimers();
    renderDesktopDom();
    window.mapleDesktop = createDesktopApi();

    await loadDesktopUi();

    expect(document.getElementById("modeValue")).toHaveTextContent("managed");
    expect(document.getElementById("gatewayValue")).toHaveTextContent("http://127.0.0.1:3000/judge");
    expect(document.getElementById("healthValue")).toHaveTextContent("http://127.0.0.1:3000/health");
    expect(document.getElementById("pidValue")).toHaveTextContent("1234");
    expect(document.getElementById("statusBadge")).toHaveTextContent("Running + Healthy");
    expect(document.getElementById("runtimeLogs")).toHaveTextContent("boot complete");
  });

  it("invokes startRuntime when Start Runtime is clicked", async () => {
    vi.useFakeTimers();
    renderDesktopDom();
    const startRuntime = vi.fn(async () => ({ ok: true }));
    window.mapleDesktop = createDesktopApi({ startRuntime });

    await loadDesktopUi();
    (document.getElementById("startBtn") as HTMLButtonElement).click();
    await flushPromises(6);

    expect(startRuntime).toHaveBeenCalledTimes(1);
  });

  it("renders start failure when startRuntime returns a non-ok response", async () => {
    vi.useFakeTimers();
    renderDesktopDom();
    const startRuntime = vi.fn(async () => ({ ok: false, error: "runtime blocked" }));
    window.mapleDesktop = createDesktopApi({
      startRuntime,
      getLogs: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        return ["boot complete"];
      },
    });

    await loadDesktopUi();
    (document.getElementById("startBtn") as HTMLButtonElement).click();
    await flushPromises(3);

    expect(document.getElementById("runtimeLogs")).toHaveTextContent("Start failed: runtime blocked");
  });

  it("renders thrown start errors", async () => {
    vi.useFakeTimers();
    renderDesktopDom();
    const startRuntime = vi.fn(async () => {
      throw new Error("bridge disconnected");
    });
    window.mapleDesktop = createDesktopApi({ startRuntime });

    await loadDesktopUi();
    (document.getElementById("startBtn") as HTMLButtonElement).click();
    await flushPromises(6);

    expect(document.getElementById("runtimeLogs")).toHaveTextContent(
      "Start error: bridge disconnected"
    );
  });

  it("opens current gateway URL via openExternal", async () => {
    vi.useFakeTimers();
    renderDesktopDom();
    const openExternal = vi.fn(async () => ({ ok: true }));
    window.mapleDesktop = createDesktopApi({
      openExternal,
      getConfig: async () => ({
        gatewayUrl: "http://127.0.0.1:3010/judge",
        mode: "managed",
        healthUrl: "http://127.0.0.1:3010/health",
      }),
    });

    await loadDesktopUi();
    (document.getElementById("openGatewayBtn") as HTMLButtonElement).click();
    await flushPromises(3);

    expect(openExternal).toHaveBeenCalledWith("http://127.0.0.1:3010/judge");
  });

  it("uses about:blank for unsafe gateway URLs", async () => {
    vi.useFakeTimers();
    renderDesktopDom();
    window.mapleDesktop = createDesktopApi({
      getConfig: async () => ({
        gatewayUrl: "http://malicious.example/judge",
        mode: "managed",
        healthUrl: "http://127.0.0.1:3000/health",
      }),
    });

    await loadDesktopUi();

    expect(document.getElementById("gatewayValue")).toHaveTextContent("http://malicious.example/judge");
    expect(document.getElementById("gatewayFrame")).toHaveAttribute("src", "about:blank");
  });

  it("falls back to browser-shell mode when bridge API is unavailable", async () => {
    vi.useFakeTimers();
    renderDesktopDom();
    delete window.mapleDesktop;

    await loadDesktopUi();

    expect(document.getElementById("fallbackBox")).toHaveStyle({ display: "block" });
    expect((document.getElementById("startBtn") as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById("stopBtn") as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById("restartBtn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows bridge warning when desktop bridge is unavailable", async () => {
    vi.useFakeTimers();
    renderDesktopDom();
    window.mapleDesktop = createDesktopApi({
      getBridgeStatus: async () => ({ available: false, error: "bridge missing" }),
    });

    await loadDesktopUi();

    expect(document.getElementById("bridgeWarning")).toHaveStyle({ display: "block" });
  });

  it("restarts runtime with stop->wait->start sequence", async () => {
    vi.useFakeTimers();
    renderDesktopDom();
    const stopRuntime = vi.fn(async () => ({ ok: true }));
    const startRuntime = vi.fn(async () => ({ ok: true }));
    window.mapleDesktop = createDesktopApi({ stopRuntime, startRuntime });

    await loadDesktopUi();
    (document.getElementById("restartBtn") as HTMLButtonElement).click();
    await flushPromises(2);
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises(5);

    expect(stopRuntime).toHaveBeenCalledTimes(1);
    expect(startRuntime).toHaveBeenCalledTimes(1);
  });

  it("falls back to window.open when openExternal bridge API is missing", async () => {
    vi.useFakeTimers();
    renderDesktopDom();
    const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);
    window.mapleDesktop = createDesktopApi({
      getConfig: async () => ({
        gatewayUrl: "http://127.0.0.1:3050/judge",
        mode: "managed",
        healthUrl: "http://127.0.0.1:3050/health",
      }),
      openExternal: undefined as unknown as DesktopApi["openExternal"],
    });

    await loadDesktopUi();
    (document.getElementById("openGatewayBtn") as HTMLButtonElement).click();
    await flushPromises(2);

    expect(windowOpen).toHaveBeenCalledWith("http://127.0.0.1:3050/judge", "_blank", "noopener");
  });

  it("does not open unsafe URLs when bridge openExternal is unavailable", async () => {
    vi.useFakeTimers();
    renderDesktopDom();
    const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);
    window.mapleDesktop = createDesktopApi({
      getConfig: async () => ({
        gatewayUrl: "http://evil.example/judge",
        mode: "managed",
        healthUrl: "http://127.0.0.1:3050/health",
      }),
      openExternal: undefined as unknown as DesktopApi["openExternal"],
    });

    await loadDesktopUi();
    (document.getElementById("openGatewayBtn") as HTMLButtonElement).click();
    await flushPromises(2);

    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("marks connection as lost when repeated poll refreshes fail", async () => {
    vi.useFakeTimers();
    renderDesktopDom();
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({ running: true, healthy: true, pid: 1234, mode: "managed" })
      .mockRejectedValue(new Error("lost"));
    window.mapleDesktop = createDesktopApi({ getStatus });

    await loadDesktopUi();
    await vi.advanceTimersByTimeAsync(15_000);
    await flushPromises(5);
    expect(document.getElementById("statusBadge")).toHaveTextContent("Connection lost");

    await vi.advanceTimersByTimeAsync(35_000);
    await flushPromises(5);
    expect(document.getElementById("statusBadge")).toHaveTextContent("Connection lost (polling stopped)");
  });

  it("shows update banner and handles failed update install", async () => {
    vi.useFakeTimers();
    renderDesktopDom();
    let updateCallback: ((info: { version: string }) => void) | undefined;
    const downloadUpdate = vi.fn(async () => ({ ok: false, error: "download blocked" }));
    window.mapleDesktop = createDesktopApi({
      onUpdateAvailable: (callback) => {
        updateCallback = callback;
      },
      downloadUpdate,
    });

    await loadDesktopUi();
    updateCallback?.({ version: "2.3.4" });

    expect(document.getElementById("updateBanner")).toHaveStyle({ display: "block" });
    expect(document.getElementById("updateVersion")).toHaveTextContent("Version 2.3.4 is ready.");

    const updateBtn = document.getElementById("updateBtn") as HTMLButtonElement;
    updateBtn.click();
    await flushPromises(5);

    expect(downloadUpdate).toHaveBeenCalledTimes(1);
    expect(updateBtn.disabled).toBe(false);
    expect(updateBtn).toHaveTextContent("Install & Restart");
    expect(document.getElementById("runtimeLogs")).toHaveTextContent("Update failed: download blocked");
  });

  it("shows restarting state when update install succeeds", async () => {
    vi.useFakeTimers();
    renderDesktopDom();
    let updateCallback: ((info: { version: string }) => void) | undefined;
    window.mapleDesktop = createDesktopApi({
      onUpdateAvailable: (callback) => {
        updateCallback = callback;
      },
      downloadUpdate: async () => ({ ok: true }),
    });

    await loadDesktopUi();
    updateCallback?.({ version: "9.9.9" });
    const updateBtn = document.getElementById("updateBtn") as HTMLButtonElement;
    updateBtn.click();
    await flushPromises(5);

    expect(updateBtn.disabled).toBe(true);
    expect(updateBtn).toHaveTextContent("Restarting…");
  });

  it("renders update errors when downloadUpdate throws", async () => {
    vi.useFakeTimers();
    renderDesktopDom();
    let updateCallback: ((info: { version: string }) => void) | undefined;
    window.mapleDesktop = createDesktopApi({
      onUpdateAvailable: (callback) => {
        updateCallback = callback;
      },
      downloadUpdate: async () => {
        throw new Error("update service unreachable");
      },
    });

    await loadDesktopUi();
    updateCallback?.({ version: "3.0.0" });
    const updateBtn = document.getElementById("updateBtn") as HTMLButtonElement;
    updateBtn.click();
    await flushPromises(5);

    expect(updateBtn.disabled).toBe(false);
    expect(updateBtn).toHaveTextContent("Install & Restart");
    expect(document.getElementById("runtimeLogs")).toHaveTextContent(
      "Update error: update service unreachable"
    );
  });
});
