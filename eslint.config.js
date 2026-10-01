// Bewusst knapp gehalten: Die Typprüfung leistet den größten Teil.
// Regeln hier nur, wo sie Fehler verhindern, die der Compiler durchlässt.
import js from '@eslint/js';
import ts from 'typescript-eslint';

/** Globale Namen der Node-Laufzeit, die in Skripten und im Simulator vorkommen. */
const nodeGlobals = {
  console: 'readonly',
  fetch: 'readonly',
  process: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  URL: 'readonly',
  Buffer: 'readonly',
};

/** Globale Namen der Browserlaufzeit für das Frontend. */
const browserGlobals = {
  document: 'readonly',
  window: 'readonly',
  console: 'readonly',
  localStorage: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
};

export default [
  { ignores: ['**/dist/**', '**/dist-types/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['werkzeuge/**/*.mjs', 'packages/epa-sim/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: nodeGlobals },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['packages/pvs/**/*.{ts,tsx}'],
    languageOptions: { globals: browserGlobals },
  },
];
