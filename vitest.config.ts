import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
    environment: 'node',
    // Nur die Oberflächentests brauchen eine Browserumgebung; die Fachlogik wird
    // bewusst ohne sie geprüft.
    environmentMatchGlobs: [['packages/pvs/**', 'jsdom']],
    globals: false,
    setupFiles: ['./werkzeuge/test-aufraeumen.ts'],
  },
});
