import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    include: ['src/**/*.test.ts'],
    // Vitest empties CSS by default; the colour contrast test reads index.css.
    css: { include: [/src\/index\.css/] },
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts', 'src/storage/**/*.ts'],
      exclude: ['src/domain/**/*.test.ts', 'src/domain/testing/**'],
      thresholds: { 100: true },
    },
  },
})
