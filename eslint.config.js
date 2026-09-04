// Flat config. The repo has had a `lint` script since the first commit but no
// config, so it exited 2 and CI never ran it -- a check that reported nothing
// while looking like it passed.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'supabase/functions'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Unused args are fine when they document a signature; a leading
      // underscore is the opt-out.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/test/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // A context provider and its hook belong in the same file; splitting them
    // to satisfy a dev-server refresh heuristic would make the code worse.
    files: [
      'src/lib/auth.tsx',
      'src/lib/preview.tsx',
      'src/lib/theme.tsx',
      'src/features/schoolYear/SchoolYearProvider.tsx',
      'src/components/ui/CategoryDot.tsx',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
)
