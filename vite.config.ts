import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // Use /web/ for GitHub Pages builds; / for local dev server convenience.
  base: command === 'build' ? '/web/' : '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
}));
