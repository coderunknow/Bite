import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
    // Blockly tests need a DOM; they opt in with `// @vitest-environment jsdom` at the top of the file.
    passWithNoTests: false,
  },
});
