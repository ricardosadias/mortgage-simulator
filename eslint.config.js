const js = require('@eslint/js');
const globals = require('globals');
const mantine = require('eslint-config-mantine');
const reactHooks = require('eslint-plugin-react-hooks');

// eslint-config-mantine targets the React/TypeScript app, but most of its blocks carry no
// `files` scope; pinned to TS so the plain-Node config files don't inherit React rules.
const mantineForApp = mantine.map((config) =>
  config.files ? config : { ...config, files: ['**/*.{ts,tsx}'] }
);

module.exports = [
  { ignores: ['dist/**', 'coverage/**', '**/*.d.ts', '**/*.d.mts'] },
  ...mantineForApp,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Type-aware linting requires the file to belong to the TypeScript project. The build
    // and tooling scripts do not, so this block has to stay scoped to TS or they fail to
    // parse the moment they stop being ignored.
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: __dirname },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
    },
  },
  // vite.config.mjs, vitest.setup.mjs and this file are plain Node, outside the TypeScript
  // project.
  {
    files: ['**/*.{js,cjs,mjs}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
