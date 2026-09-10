// vitest/config re-exports Vite's defineConfig with the `test` key typed, so
// one file can configure both without a cast.
import { defineConfig } from 'vitest/config'
import { computeStats } from './scripts/projectStats.mjs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves this project from https://<user>.github.io/Calenda/,
// so assets must resolve against that sub-path. A custom domain sets
// VITE_BASE=/ instead.
const base = process.env.VITE_BASE ?? '/Calenda/'

export default defineConfig({
  base,
  /**
   * The founder panel's figures, counted from the repository when this config
   * is evaluated -- which is at the start of every build, every dev server and
   * every test run.
   *
   * They were a hardcoded array and every one of them had drifted. Generating a
   * committed file instead was tried first and was worse: the line counts
   * change on every edit to any source file, so `npm test` went red on work
   * that had nothing to do with the panel, and a check that cries wolf gets
   * deleted. Computing them here means there is nothing to keep in step. The
   * one figure that cannot come from here is the test count -- only the runner
   * knows how many tests an `it.each` becomes -- and that lives in
   * src/data/testCount.ts, which changes when tests do and not otherwise.
   */
  define: { __PROJECT_STATS__: JSON.stringify(computeStats()) },
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
    // Where the test count comes from. A regex over the source cannot know it:
    // one `it.each` over five files is one match and five tests. The report
    // lands in node_modules so it is never committed and needs no ignore rule,
    // and the default reporter still prints to the console beside it.
    reporters: ['default', 'json'],
    outputFile: { json: 'node_modules/.vitest-report.json' },
  },
})
