// ESLint flat config (ESLint 9+). Deliberately LEAN and high-signal: this is a
// BLOCKING CI gate on a large, pre-existing codebase, so it enforces only rules
// that catch genuine bugs (not style/opinion). Stylistic and whole-codebase-
// churn rules (no-unused-vars, no-explicit-any, exhaustive-deps, …) are off or
// warn-only so the gate is green on today's code and blocks real regressions
// going forward. Ratchet stricter over time, the same way the test-typecheck
// gate does. Type-aware linting is intentionally NOT enabled (keeps the gate
// fast and avoids a second tsconfig project graph — tsc already type-checks).
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = tseslint.config(
  {
    // Not application source — build output, tooling, native scaffold, deps.
    ignores: [
      'node_modules/**',
      'coverage/**',
      'desktop/**',
      'web-build/**',
      'web-stubs/**',
      'dist/**',
      '.expo/**',
      'assets/**',
      '**/*.config.js',
      'babel.config.js',
      'metro.config.js',
      'scripts/**',
      'plugins/**', // Expo config plugins — Node CommonJS build-time, not app source.
    ],
  },
  {
    // Pre-existing inline `// eslint-disable` comments reference rules this lean
    // config doesn't enable; don't flag them as unused (pure noise).
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // RN / JS runtime globals used across the app + tests.
        console: 'readonly', process: 'readonly', require: 'readonly',
        module: 'writable', __DEV__: 'readonly', globalThis: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        fetch: 'readonly', global: 'readonly', Buffer: 'readonly',
        jest: 'readonly', describe: 'readonly', it: 'readonly', test: 'readonly',
        expect: 'readonly', beforeAll: 'readonly', afterAll: 'readonly',
        beforeEach: 'readonly', afterEach: 'readonly',
      },
    },
    rules: {
      // --- High-signal correctness (ERROR: block the merge) ---
      'no-cond-assign': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-unsafe-negation': 'error',
      'no-unsafe-finally': 'error',
      'no-constant-binary-expression': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-debugger': 'error',
      'no-fallthrough': 'error',
      'no-async-promise-executor': 'error',
      'no-compare-neg-zero': 'error',
      'getter-return': 'error',
      'no-obj-calls': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-unsafe-declaration-merging': 'error',
      '@typescript-eslint/no-duplicate-enum-values': 'error',

      // --- Noise on a legacy codebase: silence so the gate is green today ---
      // (These are real signals, but sweeping the whole tree for them is its own
      // project. Left OFF now; can be ratcheted to 'warn'/'error' incrementally.)
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-empty': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
      'no-prototype-builtins': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'prefer-const': 'off',
      'no-unused-vars': 'off',
      // OFF — incompatible with this codebase, not disabled to hide bugs:
      //  • rules-of-hooks: the store exposes ACTION methods named with the "use"
      //    verb (useHealBatch = "use a heal batch", useInventoryItem, useVendor
      //    Crucible). The rule treats every useX() call as a React hook and
      //    false-positives on all of them (and cascades onto nearby real hooks).
      'react-hooks/rules-of-hooks': 'off',
      //  • no-useless-assignment: fires on defensive try/catch fallback inits
      //    (`let buf = src; try { buf = transform(src) } catch { /* keep src */ }`)
      //    where the initial value IS the catch fallback — a false positive.
      'no-useless-assignment': 'off',
      // OFF — stylistic, not correctness (kept lean):
      'no-regex-spaces': 'off',       // literal multi-space in a regex is valid + intentional
      'preserve-caught-error': 'off', // error-cause chaining is a nicety, not a bug gate
    },
  },
  {
    // Root-level JS harness/setup files (jest.setup.js, etc.) run in Node/Jest.
    files: ['*.js', '**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly', module: 'writable', process: 'readonly',
        console: 'readonly', __dirname: 'readonly', global: 'writable',
        jest: 'readonly', beforeEach: 'readonly', afterEach: 'readonly',
        beforeAll: 'readonly', afterAll: 'readonly',
        describe: 'readonly', it: 'readonly', expect: 'readonly',
        setTimeout: 'readonly', Buffer: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
    },
  },
);
