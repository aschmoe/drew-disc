import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The client lives in client/. Dev tools under client/tools/ are served by `npm run dev`
// but are not part of the production build.
export default defineConfig({
  root: 'client',
  base: './',
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    // Three.js alone is ~550 kB minified (~145 kB gzipped); that's expected.
    chunkSizeWarningLimit: 800,
  },
  server: { host: true },
  test: {
    root: '.',
    include: ['test/**/*.test.ts'],
  },
});
