import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'

const customNetworkLog = () => ({
  name: 'custom-network-log',
  configureServer(server: any) {
    server.httpServer?.once('listening', () => {
      const hostIp = process.env.HOST_IP;
      if (hostIp) {
        setTimeout(() => {
          console.log(`\n  ➜  Host Network: https://${hostIp}:5173/`);
        }, 100);
      }
    });
  }
});

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    react(),
    basicSsl(),
    customNetworkLog()
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true
      },
      '/socket.io': {
        target: process.env.PROXY_TARGET || 'http://127.0.0.1:8000',
        ws: true
      }
    }
  }
})
