import eslint from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // eslint-plugin-react peers only through ESLint 9. @eslint-react is the maintained
  // replacement and allows ESLint 10.
  eslintReact.configs['recommended-typescript'],
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // Classic Rules of Hooks. @eslint-react's preset also turns on React Compiler
      // checks (purity, use-memo, set-state-in-effect). This app does not run the
      // compiler, and the scene mutates Three.js objects inside useFrame.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@eslint-react/rules-of-hooks': 'off',
      '@eslint-react/exhaustive-deps': 'off',
      '@eslint-react/purity': 'off',
      '@eslint-react/set-state-in-effect': 'off',
      '@eslint-react/use-memo': 'off',
      '@eslint-react/use-state': 'off',
      '@eslint-react/dom-no-unknown-property': 'error',
    },
  },
  {
    files: ['e2e/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    files: ['src/scene/**/*.{ts,tsx}'],
    rules: {
      // react-three-fiber attaches Three.js props (position, args, geometry) that are not DOM.
      '@eslint-react/dom-no-unknown-property': 'off',
    },
  },
  prettier,
);
