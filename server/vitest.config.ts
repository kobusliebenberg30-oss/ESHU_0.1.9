import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }, // serial: shared DB
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
