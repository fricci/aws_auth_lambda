/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  globals: {
    'ts-jest': {
      tsonfig: 'tsconfig.json'
    }
  },
  preset: 'ts-jest',
  testEnvironment: 'node'
};
