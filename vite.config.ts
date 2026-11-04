import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the app from /house-placer/; local dev stays at /
  base: process.env.PAGES_BASE ?? '/',
  plugins: [react()],
  server: { port: 5199 },
  test: { environment: 'node' },
} as any);
