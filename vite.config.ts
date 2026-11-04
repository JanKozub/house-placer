import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // served from the site root (Netlify); set PAGES_BASE to host under a subpath
  base: process.env.PAGES_BASE ?? '/',
  plugins: [react()],
  server: { port: 5199 },
  test: { environment: 'node' },
} as any);
