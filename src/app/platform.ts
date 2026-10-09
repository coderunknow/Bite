/**
 * Host integration. In the browser, files are saved with a download link. In the desktop app the
 * preload script exposes `window.biteDesktop`, and saving goes through the native save dialog.
 */
export interface DesktopBridge {
  /** Shows a native save dialog and writes the bytes. Resolves false if the user cancelled. */
  saveFile(fileName: string, bytes: Uint8Array, mime: string): Promise<boolean>;
  /** True when running inside the packaged desktop app. */
  readonly isDesktop: true;
}

declare global {
  interface Window {
    biteDesktop?: DesktopBridge;
  }
}

export const platform = {
  isDesktop(): boolean {
    return typeof window !== 'undefined' && window.biteDesktop !== undefined;
  },

  async saveFile(fileName: string, bytes: Uint8Array, mime: string): Promise<boolean> {
    if (window.biteDesktop) return window.biteDesktop.saveFile(fileName, bytes, mime);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  },

  /** Warns before the window closes while a save is pending or failed. */
  onBeforeUnload(hasUnsaved: () => boolean): void {
    window.addEventListener('beforeunload', (event) => {
      if (!hasUnsaved()) return;
      event.preventDefault();
      event.returnValue = '';
    });
  },
};
