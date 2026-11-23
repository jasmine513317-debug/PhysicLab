import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Tailwind is handled by its Vite plugin; do not inherit a parent workspace PostCSS config.
  css: {postcss: {plugins: []}},
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/planck/')) return 'planck'
        },
      },
    },
  },
})
