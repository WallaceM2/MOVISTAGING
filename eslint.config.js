const expo = require('eslint-config-expo/flat');

module.exports = [
  ...expo,
  {
    ignores: ['.expo/**', 'android/**', 'ios/**', 'node_modules/**', 'coverage/**'],
  },
];
