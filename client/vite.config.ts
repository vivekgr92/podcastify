import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import themeConfig from '@replit/vite-plugin-shadcn-theme-json';
import RuntimeErrorModal from '@replit/vite-plugin-runtime-error-modal';

export default defineConfig({
  plugins: [
    react(),
    themeConfig(),
    RuntimeErrorModal(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@db': path.resolve(__dirname, '../db'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});