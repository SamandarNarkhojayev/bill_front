import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  base: './', // Важно для Electron
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
  }
})
