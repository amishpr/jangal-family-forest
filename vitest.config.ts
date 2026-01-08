import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  define: { __VIEWER__: 'false' },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Component tests opt in to a DOM with a `// @vitest-environment jsdom` comment at the top.
    setupFiles: ['./src/test-setup.ts'],
  },
})
