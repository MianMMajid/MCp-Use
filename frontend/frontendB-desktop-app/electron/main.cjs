"use strict";

const path = require("node:path");
const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
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

const defaultGatewayUrl = process.env.MAPLE_DESKTOP_GATEWAY_URL ?? "http://127.0.0.1:3000/judge";
const runtimeController = createRuntimeController();

function createMainWindow() {
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

  window.loadFile(path.join(__dirname, "..", "app", "index.html"));

  window.webContents.on("will-navigate", (event, url) => { if (!url.startsWith("file://")) event.preventDefault(); });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
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

  ipcMain.handle("desktop:get-runtime-status", async () => runtimeController.getStatus());
  ipcMain.handle("desktop:start-runtime", async () => runtimeController.start());
  ipcMain.handle("desktop:stop-runtime", async () => runtimeController.stop());
  ipcMain.handle("desktop:get-runtime-logs", async (_event, limit) => {
    const safeLimit = typeof limit === "number" && limit > 0 ? Math.min(limit, 5000) : 120;
    return runtimeController.getLogs(safeLimit);
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
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
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
  runtimeController.stop().catch(() => {
    // best-effort shutdown only
  });
});
