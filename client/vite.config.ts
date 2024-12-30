
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@db': path.resolve(__dirname, '../db')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5175,
    strictPort: true,
    hmr: {
      clientPort: 443,
      protocol: 'wss'
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@tanstack/react-query']
  },
  build: {
    outDir: path.resolve(__dirname, '../dist/public'),
    emptyOutDir: true
  }
});
