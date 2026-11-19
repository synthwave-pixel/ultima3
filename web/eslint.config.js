// ESLint for the port: typescript-eslint's recommended rules with type
// information, so unawaited promises and loose types are reported, and
// Prettier's config last so no rule argues with the formatter.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'public/'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js', 'vite.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Command handlers are async as a family so callers await them alike; some have nothing to wait for.
      '@typescript-eslint/require-await': 'off',
      // A leading underscore marks a parameter kept for the interface.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // The tools' plain JavaScript (tools/node-ts.mjs, the pilot, the promo shots) is outside the TypeScript project: no
  // type information.
  { files: ['**/*.mjs', 'tools/pilot/*.js', 'tools/promo/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  { files: ['**/*.mjs'], languageOptions: { globals: { console: 'readonly', Buffer: 'readonly', URL: 'readonly' } } },
  // The pilot and the promo shots are scripts evaluated in the game's page.
  {
    files: ['tools/pilot/*.js', 'tools/promo/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        performance: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        KeyboardEvent: 'readonly',
      },
    },
  },
  prettier,
);
