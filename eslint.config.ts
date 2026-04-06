import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: ['.local/', '**/*.yml', '**/*.yaml'],
  overrides: {
    javascript: {
      'node/prefer-global/process': 'off',
      'no-console': 'off',
    },
    typescript: {
      'node/prefer-global/process': 'off',
      'no-console': 'off',
    },
    test: {
      'style/max-statements-per-line': 'off',
    },
  },
})
