/** @type {import('@ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  rootDir: './src',
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '\\.worker\\.js$': '<rootDir>/../jest.raw-transform.js',
  },
};
