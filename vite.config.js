import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true
  }
});
