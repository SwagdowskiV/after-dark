import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, '../shared') },
  },
  server: {
    port: 5180, // its own port, so it never collides with other Vite projects (default 5173)
    strictPort: true,
    host: true, // lets phones/laptops on your Wi-Fi open the dev server
    fs: { allow: ['..'] },
    proxy: {
      // During development, game traffic is forwarded to the Node server.
      // Uses the same PORT variable as the server, so changing it once moves both.
      '/socket.io': { target: `http://localhost:${process.env.PORT || 3101}`, ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 2000 },
});
