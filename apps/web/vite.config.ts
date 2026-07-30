import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Where `pnpm dev` finds the Rust server. */
const BACKEND = process.env.WEBSH_BACKEND ?? 'http://127.0.0.1:8999';

export default defineConfig({
  plugins: [react()],
  build: {
    // This directory is embedded into the server binary by rust-embed, so the
    // path is part of the build contract with crates/websh-server.
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: false },
      '/ws': { target: BACKEND, ws: true, changeOrigin: false },
    },
  },
});
