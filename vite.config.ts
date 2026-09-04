// vitest/config re-exports Vite's defineConfig with the `test` key typed, so
// one file can configure both without a cast.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves this project from https://<user>.github.io/Calenda/,
// so assets must resolve against that sub-path. A custom domain sets
// VITE_BASE=/ instead.
const base = process.env.VITE_BASE ?? '/Calenda/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      output: {
        // Split the dependencies that change on a different cadence from our
        // code, so a UI tweak doesn't invalidate the whole cached bundle.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          motion: ['motion'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
