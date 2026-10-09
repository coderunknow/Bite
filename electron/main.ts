/**
 * Bite desktop shell (Electron main process). It opens the bundled web app in a sandboxed window.
 * Files are saved through a native save dialog. The renderer has no Node.js access.
 */
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

/** Largest package the desktop save path accepts (matches the project package limit). */
const MAX_SAVE_BYTES = 256 * 1024 * 1024;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1000,
    minHeight: 640,
    title: 'Bite',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  // The app is a single local page. Navigation to anything else (or new windows) is refused.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  void mainWindow.loadFile(join(__dirname, 'web', 'index.html'));
}

/** Keeps only a plain file name: no folders, no hidden-file dots, no control characters. */
export function safeFileName(name: string): string {
  // Control characters are removed on purpose, so the regex is intentional.
  // eslint-disable-next-line no-control-regex
  const base = basename(name).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').replace(/^\.+/, '').trim();
  return base.length > 0 ? base.slice(0, 120) : 'project.bite';
}

ipcMain.handle('bite:save-file', async (event, fileName: unknown, bytes: unknown) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorised save request.');
  if (typeof fileName !== 'string' || !(bytes instanceof Uint8Array)) throw new Error('Invalid save request.');
  if (bytes.byteLength > MAX_SAVE_BYTES) throw new Error('The file is too large to save.');
  const name = safeFileName(fileName);
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: name,
    filters: [
      { name: 'Bite package', extensions: ['bite'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePath) return false;
  await writeFile(result.filePath, Buffer.from(bytes));
  return true;
});

void app.whenReady().then(() => {
  // The app asks for no permissions (no camera, microphone, notifications or location).
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
