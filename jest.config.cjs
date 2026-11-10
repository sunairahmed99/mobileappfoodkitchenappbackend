// Jest configuration. Run with: npx jest --config jest.config.cjs
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  clearMocks: true,
  // Sets process.env.jwttoken BEFORE app.js is imported so dotenv never needs
  // to supply the real secret and the JWT tests are deterministic.
  setupFiles: ['<rootDir>/tests/setup.js'],
  testMatch: ['**/*.test.js'],
  testTimeout: 15000,
  verbose: true,
};
