import { defineConfig } from 'vite';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/3TorusAsteroids/' : '/',
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
}));
