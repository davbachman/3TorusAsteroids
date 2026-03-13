import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/3TorusAsteroids/' : '/',
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
}));
