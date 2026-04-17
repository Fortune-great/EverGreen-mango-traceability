import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { 
    port: 4000,
    hmr: { overlay: false },
    watch: { usePolling: true }
  }
})
