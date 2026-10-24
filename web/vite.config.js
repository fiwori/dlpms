import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The proxy sends /api requests to the backend, so the browser never needs CORS
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
