import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

/**
 * Vitest config for Skimm. Renderer code needs a DOM (jsdom) so the
 * markdown pipeline / hast utilities work. Pure main-side tests can
 * still opt into node env per-file via the `// @vitest-environment node`
 * pragma. Path aliases match the renderer tsconfig so test imports
 * look identical to production code.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Keep test runs clean; individual files override with
    // `// @vitest-environment node` when needed.
    setupFiles: []
  }
})
