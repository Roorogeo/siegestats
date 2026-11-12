import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/** Import boundaries: shared <- core <- main; preload and renderer see only shared. */
const restrict = (patterns, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
});

const ELECTRON = ['electron', 'electron/*', 'electron-store', '@overwolf/*'];
const NODE = ['node:*', 'fs', 'path', 'os', 'child_process', 'http', 'https', 'crypto'];
const UI = ['react', 'react-dom', 'react-dom/*', 'react-router', 'react-router/*', '@tanstack/*', 'lucide-react'];

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'dist-web/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/shared/**/*.ts'],
    rules: restrict(
      [...ELECTRON, ...NODE, ...UI, '@core/*', '@renderer/*', '**/core/**', '**/main/**', '**/renderer/**'],
      'src/shared is pure TypeScript: no Electron, Node, UI or core imports.',
    ),
  },
  {
    files: ['src/core/**/*.ts'],
    rules: restrict(
      [...ELECTRON, ...NODE, ...UI, '@renderer/*', '**/main/**', '**/renderer/**'],
      'src/core must not know about Electron, Node or the UI. Use a port.',
    ),
  },
  {
    files: ['src/main/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: restrict([...UI, '@renderer/*', '**/renderer/**'], 'src/main must not import UI code.'),
  },
  {
    files: ['src/preload/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: restrict(
      [...NODE, ...UI, 'electron-store', '@core/*', '@renderer/*', '**/core/**', '**/main/**', '**/renderer/**'],
      'The preload only bridges: electron (contextBridge, ipcRenderer) and src/shared.',
    ),
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...restrict(
        [...ELECTRON, ...NODE, '@core/*', '**/core/**', '**/main/**', '**/preload/**'],
        'The renderer talks to everything else through window.bridge only.',
      ),
    },
  },
  {
    // The one sanctioned edge: the in-page bridge runs core in the browser (development and tests).
    files: ['src/renderer/src/bridge/browser-bridge.ts'],
    rules: restrict([...ELECTRON, ...NODE, '**/main/**', '**/preload/**'], 'The browser bridge may use core, nothing else.'),
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.{js,mjs}', 'build/**/*.ts', '*.config.{ts,js}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
