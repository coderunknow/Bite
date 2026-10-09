/**
 * Desktop shell for Bite Studio. The renderer is the same `dist/` bundle the web build serves.
 *
 * Security posture: sandboxed renderer, context isolation on, no Node in the page, no preload bridge,
 * navigation and new windows denied, all permission requests denied (the app needs none: audio playback
 * does not require a permission, and there is no network use). The bundle is served from the privileged
 * `app://` scheme so module scripts load (Chromium blocks module scripts from file://).
 *
 * BITE_SMOKE_EXIT=1 makes the app quit by itself once the first page has rendered; used by the launch check.
 */
import { app, BrowserWindow, net, protocol, session, type Session } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_HOST, APP_SCHEME, resolveAppPath } from './paths';


protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

/** Resolves the built renderer directory both in the source tree and inside the packaged app.asar. */
function distDir(): string {
  return path.resolve(__dirname, '..', 'dist');
}

function lockDown(sess: Session): void {
  sess.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  sess.setPermissionCheckHandler(() => false);
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Bite Studio',
    backgroundColor: '#1d2129',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });
  lockDown(win.webContents.session);

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.once('ready-to-show', () => win.show());
  void win.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`);

  if (process.env.BITE_SMOKE_EXIT === '1') {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => app.quit(), 4000);
    });
  }
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    const root = distDir();
    protocol.handle(APP_SCHEME, (request) => {
      const file = resolveAppPath(request.url, root);
      if (!file) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    // Nothing in the app uses the network. Refuse every request except the bundled scheme, data: and blob:.
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const ok = details.url.startsWith(`${APP_SCHEME}://${APP_HOST}/`) || details.url.startsWith('data:') || details.url.startsWith('blob:');
      callback({ cancel: !ok });
    });
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  // Every window and webview: only the bundled app may navigate.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!url.startsWith(`${APP_SCHEME}://${APP_HOST}/`)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

}
