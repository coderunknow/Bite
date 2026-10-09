import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works from a web server root and from the
// Electron `app://` protocol (see electron/main.ts).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 4000,
  },
});
