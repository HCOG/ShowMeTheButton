import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ShowMeCore',
      formats: ['es', 'umd'],
      fileName: (format) => (format === 'es' ? 'index.mjs' : 'index.js'),
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
