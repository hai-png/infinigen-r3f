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
  },
});
