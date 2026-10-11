import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 127.0.0.1, not localhost: the API binds IPv4 loopback only (sign-in
      // P2a), and localhost can resolve to ::1 first.
      '/api': 'http://127.0.0.1:3001',
    },
  },
})
