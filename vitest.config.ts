import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30_000,
    // Serial execution: the app's FileStateStore + 45s cooldown are
    // process-global, so parallel files would fight over the same state.
    maxWorkers: 1,
  },
});
