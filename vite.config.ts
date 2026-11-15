import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // Use /disbox_fork/web/ for this fork's GitHub Pages project site; / for local dev server convenience.
  base: command === 'build' ? '/disbox_fork/web/' : '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          mui: ['@mui/material', '@emotion/react', '@emotion/styled'],
          grid: ['@mui/x-data-grid'],
        },
      },
    },
  },
  test: {
    environment: 'node',
  },
}));
