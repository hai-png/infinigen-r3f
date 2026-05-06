import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    modules: {},
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    deps: {
      inline: ['three-mesh-bvh', 'three-bvh-csg'],
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/**/types.ts',
        'src/core/nodes/core/types.ts',
      ],
      thresholds: {
        // Minimum 30% coverage for modified files
        'src/__tests__/utils/**': {
          branches: 30,
          functions: 30,
          lines: 30,
          statements: 30,
        },
      },
    },
  },
});
