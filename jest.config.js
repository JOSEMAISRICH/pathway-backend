/**
 * Jest config — corre `npm test`. Usa --runInBand para que el proceso del
 * mongo-memory-server creado en globalSetup propague process.env a los tests.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  globalSetup: '<rootDir>/tests/jest.globalSetup.js',
  globalTeardown: '<rootDir>/tests/jest.globalTeardown.js',
  setupFiles: ['<rootDir>/tests/jest.envSetup.js'],
  testTimeout: 30000,
  clearMocks: true,
  resetModules: false,
  verbose: true,
  silent: true,
  transform: {
    '^.+\\.m?js$': 'babel-jest',
  },
  // Estas dependencias se publican como ESM puro sin build CJS; pedimos a
  // babel-jest que las transforme (por defecto node_modules se ignora).
  transformIgnorePatterns: ['/node_modules/(?!(jose|uuid)/)'],
};
