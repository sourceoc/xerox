const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  {
    files: ['**/*.js', '**/*.ts'],
    plugins: {
      '@typescript-eslint': typescriptEslint,
      prettier: prettierPlugin,
    },
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        browser: 'readonly',
        node: 'readonly',
      },
    },
    rules: {
      ...typescriptEslint.configs.recommended.rules,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
    },
  },
];
