import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // migration-reference/ is the pre-migration spike; its copies of these tests are
    // superseded by test/. The directory is removed in the final phase.
    exclude: ['node_modules', 'dist', 'migration-reference'],
  },
})
