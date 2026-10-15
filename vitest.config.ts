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
    // Die zweite Datei tut nur etwas mit FHIR_AUSGABE (npm run fhir:validieren).
    setupFiles: ['./werkzeuge/test-aufraeumen.ts', './werkzeuge/fhir-ausgabe-sichern.ts'],
  },
});
