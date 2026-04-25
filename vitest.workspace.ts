import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    test: {
      name: 'web',
      root: './apps/web',
      environment: 'node',
      include: ['src/**/*.test.{ts,tsx}'],
    },
  },
  {
    test: {
      name: 'api',
      root: './apps/api',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'shared',
      root: './packages/shared',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'notifications',
      root: './packages/notifications',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  },
])
