
/**
 * Electron preload script — exposes safe APIs to the renderer process.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  onMessage: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  sendMessage: (channel: string, ...args: unknown[]) => {
    ipcRenderer.send(channel, ...args);
  },
});
