// Pure unit tests only (no workerd). vite.config.ts is for the worker build.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
})
