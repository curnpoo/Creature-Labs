import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('planck-js') || id.includes('matter-js') || id.includes('earcut')) {
              return 'vendor-physics';
            }
            return 'vendor';
          }
          if (id.includes('/src/data/defaultCreatureCatalog.js') || id.includes('/src/data/default-creatures/')) {
            return 'catalog-data';
          }
          if (id.includes('/src/ui/Visualizer.js') || id.includes('/src/ui/ProgressChart.js')
            || id.includes('/src/utils/EvolutionMonitor.js') || id.includes('/src/ui/EvolutionFeedback.js')) {
            return 'ui-heavy';
          }
          if (id.includes('/src/sim/') || id.includes('/src/nn/') || id.includes('/src/utils/config')) {
            return 'sim-core';
          }
          if (id.includes('/src/appBootstrap.js')) {
            return 'app-bootstrap';
          }
          return undefined;
        }
      }
    }
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
