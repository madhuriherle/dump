import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 2508,
    // Fail loudly instead of silently jumping to the next free port when
    // 2508 is still occupied (e.g. Launch_ATMS.bat's kill step raced the
    // OS releasing the socket) - this is a fixed kiosk address other
    // devices on the WiFi rely on, so a silent port change is worse than
    // a visible failure.
    strictPort: true,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:2509',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/uploads': {
        target: 'http://127.0.0.1:2509',
        changeOrigin: true,
      },
    },
  },
});
