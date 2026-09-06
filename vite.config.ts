import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // New stamp on every dev-server start / production build. The client compares
  // it to the stored one and wipes personalisation on a mismatch (see
  // src/lib/freshStart.ts) so each run of the app starts from a clean profile.
  define: { __APP_SESSION__: JSON.stringify(String(Date.now())) },
  server: { port: 5173, host: true },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-core': ['react', 'react-dom'],
          'react-router': ['react-router-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          leaflet: ['leaflet'],
        },
      },
    },
  },
})
