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
    proxy: {
      '/api': 'http://localhost:4000'
    }
  },
  define: {
    'import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY': `"${process.env.STRIPE_PUBLISHABLE_KEY}"`,
  }
});