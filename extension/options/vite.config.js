import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  // Serve extension assets (icons, placeholder) in dev at /placeholder.png etc.
  publicDir: '../assets',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  base: './',
});
