import { defineConfig } from 'vite';
import path from 'node:path';
export default defineConfig({
  root: 'mobile',
  resolve: { alias: { '@': path.resolve('src') } },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
  esbuild: { jsx: 'automatic' },
  build: { target: 'esnext', outDir: 'dist', emptyOutDir: true },
});
