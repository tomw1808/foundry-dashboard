import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from '@tailwindcss/vite'

import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173, // Default Vite port, ensure it's different from backend
    proxy: {
      // Proxy API requests (including RPC) to the backend server
      '/api': {
        target: 'http://localhost:3001', // Default backend port
        changeOrigin: true,
      },
      // Proxy WebSocket connections
      // Vite uses '/ws' internally, so choose a different path like '/socket'
      '/socket': {
        target: 'ws://localhost:3001', // Backend WebSocket
        ws: true,
        // Optional: Rewrite path if backend expects '/ws' or root '/'
        // rewrite: (path) => path.replace(/^\/socket/, '')
      },
    }
  }
})
