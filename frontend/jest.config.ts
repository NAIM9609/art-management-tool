import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  testMatch: ['**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};

export default config;
