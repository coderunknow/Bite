/**
 * Preload script: exposes one narrow API to the web app as `window.biteDesktop`.
 * Nothing else from Node.js or Electron is reachable from the page.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('biteDesktop', {
  isDesktop: true,
  saveFile(fileName: string, bytes: Uint8Array, _mime: string): Promise<boolean> {
    return ipcRenderer.invoke('bite:save-file', fileName, bytes);
  },
});
