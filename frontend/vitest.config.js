import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Kept apart from vite.config.js so the Tailwind plugin and the dev proxy stay out of the test run.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    css: false,
    include: ['src/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/**/*.test.{js,jsx}'],
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
});
