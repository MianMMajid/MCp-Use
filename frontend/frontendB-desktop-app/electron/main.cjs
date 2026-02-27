"use strict";

const path = require("node:path");
const fs = require("node:fs/promises");
const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, shell, safeStorage } = require("electron");
let createRuntimeController;
let bridgeAvailable = true;
let bridgeError = "";
try {
  ({ createRuntimeController } = require("../bridge-runtime/runtime-controller.cjs"));
} catch (err) {
  bridgeAvailable = false;
  bridgeError = String(err.message ?? "unknown error");
  console.warn("[desktop] bridge-runtime unavailable, using stub:", bridgeError);
  createRuntimeController = () => ({
    getStatus: async () => ({ running: false, healthy: false, pid: null, mode: "external" }),
    start: async () => ({ ok: false, error: "Runtime bridge is not installed. Run 'npm run sync:bridge' to set up the runtime controller." }),
    stop: async () => ({ ok: true }),
    getLogs: async () => [],
  });
}

let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch {
  // electron-updater not available — skip auto-update
}

let tray = null;
let trayPollTimer = null;

const defaultGatewayUrl = process.env.MAPLE_DESKTOP_GATEWAY_URL ?? "http://127.0.0.1:3000/judge";
const defaultDesktopUiUrl = process.env.MAPLE_DESKTOP_UI_URL ?? "http://127.0.0.1:4102";
const runtimeController = createRuntimeController();
const secureStoreFilename = "maple-desktop-secure-store.json";

let mainWindow = null;

function secureStorePath() {
  return path.join(app.getPath("userData"), secureStoreFilename);
}

async function readSecureStore() {
  try {
    const raw = await fs.readFile(secureStorePath(), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeSecureStore(payload) {
  const normalized = payload && typeof payload === "object" ? payload : {};
  await fs.mkdir(path.dirname(secureStorePath()), { recursive: true });
  await fs.writeFile(secureStorePath(), JSON.stringify(normalized, null, 2), "utf8");
}

function encryptSecureValue(value) {
  const text = typeof value === "string" ? value : "";
  if (!text) {
    return "";
  }
  if (safeStorage?.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(text);
    return `enc:${encrypted.toString("base64")}`;
  }
  return `plain:${text}`;
}

function decryptSecureValue(value) {
  const raw = typeof value === "string" ? value : "";
  if (!raw) {
    return "";
  }
  if (raw.startsWith("enc:")) {
    if (!safeStorage?.isEncryptionAvailable()) {
      return "";
    }
    const encoded = raw.slice(4);
    try {
      return safeStorage.decryptString(Buffer.from(encoded, "base64"));
    } catch {
      return "";
    }
  }
  if (raw.startsWith("plain:")) {
    return raw.slice(6);
  }
  return raw;
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }
  const window = new BrowserWindow({
    width: 1260,
    height: 860,
    minWidth: 1000,
    minHeight: 700,
    title: "Maple Desktop",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (/^https?:\/\//i.test(defaultDesktopUiUrl)) {
    window.loadURL(defaultDesktopUiUrl);
  } else {
    window.loadFile(path.join(__dirname, "..", "app", "index.html"));
  }

  window.webContents.on("will-navigate", (event, url) => { if (!url.startsWith("file://")) event.preventDefault(); });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.on("closed", () => { mainWindow = null; });
  mainWindow = window;
}

function isAllowedExternalUrl(url) {
  if (typeof url !== "string") {
    return false;
  }
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && parsed.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

app.whenReady().then(() => {
  ipcMain.handle("desktop:get-config", async () => {
    return {
      gatewayUrl: defaultGatewayUrl,
      mode: process.env.MAPLE_DESKTOP_RUNTIME_MODE ?? "external",
      healthUrl: process.env.MAPLE_DESKTOP_RUNTIME_HEALTH_URL ?? "http://127.0.0.1:3000/health",
    };
  });

  ipcMain.handle("desktop:get-bridge-status", async () => ({
    available: bridgeAvailable,
    error: bridgeError,
  }));

  ipcMain.handle("desktop:get-runtime-status", async () => {
    try { return await runtimeController.getStatus(); }
    catch (err) { return { running: false, healthy: false, pid: null, mode: "external", error: String(err.message ?? err) }; }
  });
  ipcMain.handle("desktop:start-runtime", async () => {
    try { return await runtimeController.start(); }
    catch (err) { return { ok: false, error: String(err.message ?? err) }; }
  });
  ipcMain.handle("desktop:stop-runtime", async () => {
    try { return await runtimeController.stop(); }
    catch (err) { return { ok: false, error: String(err.message ?? err) }; }
  });
  ipcMain.handle("desktop:get-runtime-logs", async (_event, limit) => {
    const safeLimit = typeof limit === "number" && limit > 0 ? Math.min(limit, 5000) : 120;
    return runtimeController.getLogs(safeLimit);
  });
  ipcMain.handle("desktop:get-api-key", async () => {
    const store = await readSecureStore();
    return { ok: true, value: decryptSecureValue(store.apiKey) };
  });
  ipcMain.handle("desktop:set-api-key", async (_event, value) => {
    const store = await readSecureStore();
    store.apiKey = encryptSecureValue(typeof value === "string" ? value.trim() : "");
    await writeSecureStore(store);
    return { ok: true };
  });
  ipcMain.handle("desktop:clear-api-key", async () => {
    const store = await readSecureStore();
    delete store.apiKey;
    await writeSecureStore(store);
    return { ok: true };
  });
  ipcMain.handle("desktop:open-external", async (_event, url) => {
    if (!isAllowedExternalUrl(url)) {
      throw new Error("Only http/https URLs are allowed");
    }
    await shell.openExternal(url);
    return { ok: true };
  });

  const isMac = process.platform === "darwin";
  const menuTemplate = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        ...(app.isPackaged ? [] : [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
        ]),
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        ...(isMac ? [{ role: "zoom" }, { type: "separator" }, { role: "front" }] : [{ role: "close" }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  createMainWindow();

  // Auto-update check
  if (autoUpdater) {
    autoUpdater.autoDownload = false;
    autoUpdater.on("update-available", (info) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length === 0) return;
      const win = windows[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send("desktop:update-available", {
          version: String(info?.version ?? "unknown"),
          releaseDate: String(info?.releaseDate ?? ""),
        });
      }
    });
    autoUpdater.checkForUpdates().catch(() => {});
  }

  let updateInstalling = false;
  ipcMain.handle("desktop:download-update", async () => {
    if (!autoUpdater) return { ok: false, error: "Auto-updater not available" };
    if (updateInstalling) return { ok: false, error: "Update already in progress" };
    updateInstalling = true;
    try {
      const downloadResult = await autoUpdater.downloadUpdate();
      if (!downloadResult || (Array.isArray(downloadResult) && downloadResult.length === 0)) {
        updateInstalling = false;
        return { ok: false, error: "Download returned no files. Update may have failed." };
      }
      setImmediate(() => {
        try { autoUpdater.quitAndInstall(false, true); } catch { app.quit(); }
      });
      return { ok: true };
    } catch (err) {
      updateInstalling = false;
      return { ok: false, error: String(err.message ?? err) };
    }
  });

  // System tray
  const trayIcon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABjSURBVFhH7c0xDQAgDAXRDgJwgQtcIIJFsLB0adKlQ/5Lvp7dHBER3/a9PwjAAAYwgAEMYAADGMAABjCAAQxgAAMYwAAGMIABDGAAAxjAAAYwgAEMYAADGMAABjDg57J9ASf5DG/T2CVZAAAAASUVORK5CYII="
  );
  tray = new Tray(trayIcon);
  tray.setToolTip("Maple Desktop");

  function updateTrayMenu(statusLabel) {
    if (!tray || tray.isDestroyed()) return;
    const contextMenu = Menu.buildFromTemplate([
      { label: `Status: ${statusLabel}`, enabled: false },
      { type: "separator" },
      { label: "Show Window", click: () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) { win.show(); win.focus(); }
      }},
      { label: "Start Runtime", click: () => runtimeController.start().catch(() => {}) },
      { label: "Stop Runtime", click: () => runtimeController.stop().catch(() => {}) },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]);
    tray.setContextMenu(contextMenu);
  }
  updateTrayMenu("Checking...");

  // Periodic tray status update
  let trayPollInFlight = false;
  trayPollTimer = setInterval(async () => {
    if (trayPollInFlight) return;
    trayPollInFlight = true;
    try {
      const status = await runtimeController.getStatus();
      const label = status.running && status.healthy ? "Running" : status.running ? "Starting..." : "Stopped";
      updateTrayMenu(label);
      if (tray && !tray.isDestroyed()) tray.setToolTip(`Maple Desktop — ${label}`);
    } catch {
      updateTrayMenu("Unknown");
    } finally {
      trayPollInFlight = false;
    }
  }, 10000);

  if (String(process.env.MAPLE_DESKTOP_AUTOSTART_RUNTIME ?? "0") === "1") {
    runtimeController.start().catch((err) => console.error("[desktop] autostart failed:", err));
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (trayPollTimer) clearInterval(trayPollTimer);
  if (tray && !tray.isDestroyed()) tray.destroy();
  runtimeController.stop().catch(() => {
    // best-effort shutdown only
  });
});
