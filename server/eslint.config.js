// ESLint v9 flat config for the ESHU backend.
//
// Goals (intentionally minimal):
//   1. Catch real bugs (TS recommended + a few hand-picked extras).
//   2. Stay out of formatting arguments — Prettier owns whitespace.
//   3. Be cheap: no type-aware rules (no `parserOptions.project`), so it
//      runs in well under a second.
//
// Run:  npm run lint
// Auto-fix:  npx eslint "src/**/*.ts" --fix

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    // Don't lint build artifacts, generated Prisma client, scripts, or tests.
    // Tests have their own pragmatic style (lots of `any`, fixture shortcuts).
    ignores: [
      'dist/**',
      'node_modules/**',
      'prisma/**',
      'scripts/**',
      'src/test/**',
      'eslint.config.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Express middleware uses leading-underscore params (`_req`, `_next`)
      // to mark intentional non-use; keep that idiom legal.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // We use `!` extensively after `requireAuth` middleware guarantees
      // session.userId is set; a hard ban would force noisy refactors.
      '@typescript-eslint/no-non-null-assertion': 'off',

      // Sometimes useful at the boundary (legacy JSON blob, multer files).
      // Prefer `unknown`, but don't fail the build over isolated escapes.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Empty catches that swallow errors are bugs; require at least a comment.
      'no-empty': ['error', { allowEmptyCatch: false }],

      // Disallow `console.*` in src — we have a structured logger (`pino`).
      // `console.warn`/`console.error` stay allowed for true last-resort cases.
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Catch lingering debugger statements before they ship.
      'no-debugger': 'error',
    },
  },
);
