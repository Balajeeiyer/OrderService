module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  testTimeout: 30000,
  collectCoverageFrom: [
    'srv/**/*.js',
    '!srv/**/*.test.js',
    '!**/node_modules/**'
  ],
  coverageThresholds: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  verbose: true
};
