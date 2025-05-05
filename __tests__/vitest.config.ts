import path from 'node:path';
import {
  configDefaults,
  coverageConfigDefaults,
  defineConfig,
} from 'vitest/config';

const isDebug =
  process.env.NODE_OPTIONS?.includes('--inspect') ||
  process.env.NODE_OPTIONS?.includes('--inspect-brk');

export default defineConfig({
  test: {
    include: ['**/*.spec.ts'],
    exclude: [...configDefaults.exclude, 'build/**/*', 'node_modules/**/*'],
    coverage: {
      provider: 'v8',
      exclude: [...coverageConfigDefaults.exclude, 'build/**/*'],
    },
    setupFiles: [path.resolve(import.meta.dirname, './vitest.setup.ts')],
    testTimeout: isDebug ? 0 : 30000, // 0 means no timeout in debug mode
  },
});
