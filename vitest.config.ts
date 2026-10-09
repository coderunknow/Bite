import { defineConfig } from 'vitest/config';

// Unit tests (pure logic, physics, storage) run in Node. Editor-facing integration tests opt into
// jsdom per file with a `@vitest-environment jsdom` docblock. Browser behaviour is covered by e2e/.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/integration/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 20000,
    restoreMocks: true,
  },
});
