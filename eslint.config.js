import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-e2e/**',
      '**/node_modules/**',
      'apps/web/postcss.config.js',
      '.claude/**',
      '.gitnexus/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          groups: [['^react', '^@?\\w'], ['^@kiotviet-lite/shared'], ['^@/'], ['^\\.']],
        },
      ],
      'simple-import-sort/exports': 'error',
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },
  {
    files: ['apps/web/e2e/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
)
