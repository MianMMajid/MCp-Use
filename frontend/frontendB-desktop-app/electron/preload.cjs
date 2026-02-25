"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mapleDesktop", {
  getConfig: () => ipcRenderer.invoke("desktop:get-config"),
  getStatus: () => ipcRenderer.invoke("desktop:get-runtime-status"),
  startRuntime: () => ipcRenderer.invoke("desktop:start-runtime"),
  stopRuntime: () => ipcRenderer.invoke("desktop:stop-runtime"),
  getLogs: (limit = 120) => ipcRenderer.invoke("desktop:get-runtime-logs", limit),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
});
