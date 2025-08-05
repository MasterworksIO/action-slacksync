import { fileURLToPath } from 'node:url'

import vitest from '@vitest/eslint-plugin'
import globals from 'globals'

import * as base from '@masterworks/eslint-config-masterworks/base/index.js'
import * as node from '@masterworks/eslint-config-masterworks/node/index.js'
import * as stylish from '@masterworks/eslint-config-masterworks/stylish/index.js'
import * as typescriptStrict from '@masterworks/eslint-config-masterworks/typescript-strict/index.js'
import * as typescriptStylish from '@masterworks/eslint-config-masterworks/typescript-stylish/index.js'
import * as typescript from '@masterworks/eslint-config-masterworks/typescript/index.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const BASE_PATTERN = ['**/*.js', '**/*.ts']

const ESLINT_CONFIG = [
  {
    // Leave this field alone so it is applied as a global setting.
    // NOTE: DO NOT add more fields to this object.
    ignores: ['**/_build/**', '**/dist/**', '**/node_modules/**', '.output/**', '.vscode/**'],
  },
  base.apply({
    tsconfigRootDir: __dirname,
    files: BASE_PATTERN,
  }),
  {
    files: BASE_PATTERN,
    languageOptions: {
      globals: {
        process: 'readonly',
      },
    },
  },
  node.apply({ files: BASE_PATTERN }),
  {
    files: BASE_PATTERN,
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  typescript.apply({ tsconfigRootDir: __dirname }),
  typescriptStrict.apply({
    rules: {
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
        },
      ],
    },
  }),
  stylish.apply({
    files: BASE_PATTERN,
    rules: {
      'dot-notation': 'off',
    },
  }),
  typescriptStylish.apply(),
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
    },
    settings: {
      vitest: {
        typecheck: true,
      },
    },
  },
]

export default ESLINT_CONFIG
