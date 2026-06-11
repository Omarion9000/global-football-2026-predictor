import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // `server-only` throws when imported outside a React Server Component
      // context. Vitest runs in plain Node, so resolve the import to an empty
      // shim. Production builds still consume the real `server-only` module,
      // so the build-time enforcement remains intact.
      'server-only': resolve(__dirname, 'vitest.server-only-shim.ts'),
    },
  },
});
