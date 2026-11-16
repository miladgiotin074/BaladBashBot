import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// مینی‌اپ در پوشهٔ web قرار دارد و خروجی در dist/web ساخته می‌شود (سرور همان را سرو می‌کند).
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    target: 'es2020',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
