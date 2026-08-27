import path from 'node:path'
import { defineWorkspace } from 'vitest/config'

/**
 * Biến môi trường cho test: `apps/api/src/lib/env.ts` chạy validateSecrets()
 * ngay lúc import, nên phải có sẵn TRƯỚC khi test file được nạp (beforeAll là
 * quá muộn). Đặt ở đây để test không phụ thuộc file .env cá nhân, vốn bị
 * gitignore và không tồn tại trên CI. Giá trị chỉ dùng cho test.
 */
const TEST_ENV = {
  // Test dùng PGlite trong bộ nhớ (xem src/__tests__/helpers/test-env.ts); chuỗi
  // này chỉ để module src/db/index.ts nạp được, postgres.js kết nối lazy nên
  // không có kết nối thật nào được mở.
  DATABASE_URL: 'postgres://test:test@127.0.0.1:5432/test',
  JWT_ACCESS_SECRET: 'test-access-secret-min-32-chars-please-change',
  JWT_REFRESH_SECRET: 'test-refresh-secret-min-32-chars-please-change',
  ACCESS_TOKEN_TTL_SECONDS: '900',
  REFRESH_TOKEN_TTL_SECONDS: '604800',
  BCRYPT_ROUNDS: '4',
  COOKIE_SECURE: 'false',
}

/**
 * Integration test dựng PGlite trong bộ nhớ rồi chạy migration cho từng test,
 * có test dựng hai instance cùng lúc (kiểm tra multi-tenant). Ngưỡng mặc định
 * của vitest (test 5s, hook 10s) đủ trên máy dev nhưng không đủ trên runner CI,
 * vốn chậm hơn khoảng 4 lần.
 */
const PGLITE_TIMEOUTS = {
  testTimeout: 30_000,
  hookTimeout: 30_000,
}

export default defineWorkspace([
  {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './apps/web/src'),
      },
    },
    test: {
      name: 'web',
      root: './apps/web',
      environment: 'node',
      include: ['src/**/*.test.{ts,tsx}'],
      ...PGLITE_TIMEOUTS,
    },
  },
  {
    test: {
      name: 'api',
      root: './apps/api',
      environment: 'node',
      include: ['src/**/*.test.ts'],
      env: TEST_ENV,
      ...PGLITE_TIMEOUTS,
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
