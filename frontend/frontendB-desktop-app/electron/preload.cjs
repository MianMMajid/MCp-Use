"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mapleDesktop", {
  getConfig: () => ipcRenderer.invoke("desktop:get-config"),
  getBridgeStatus: () => ipcRenderer.invoke("desktop:get-bridge-status"),
  getStatus: () => ipcRenderer.invoke("desktop:get-runtime-status"),
  startRuntime: () => ipcRenderer.invoke("desktop:start-runtime"),
  stopRuntime: () => ipcRenderer.invoke("desktop:stop-runtime"),
  getLogs: (limit = 120) => ipcRenderer.invoke("desktop:get-runtime-logs", typeof limit === "number" && limit > 0 ? limit : 120),
  openExternal: (url) => {
    if (typeof url !== "string") throw new Error("URL must be a string");
    return ipcRenderer.invoke("desktop:open-external", url);
  },
  downloadUpdate: () => ipcRenderer.invoke("desktop:download-update"),
  onUpdateAvailable: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on("desktop:update-available", handler);
    return () => ipcRenderer.removeListener("desktop:update-available", handler);
  },
});
