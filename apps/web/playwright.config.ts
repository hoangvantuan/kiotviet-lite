import { defineConfig, devices } from '@playwright/test'

/**
 * Cấu hình Playwright cho kiểm thử E2E của KiotViet Lite Web
 *
 * Lưu ý quan trọng:
 * - Kiểm thử E2E yêu cầu cơ sở dữ liệu PostgreSQL thật đã chạy db:migrate và db:seed.
 * - Không sử dụng PGlite trong bộ nhớ cho bộ kiểm thử này.
 * - Đảm bảo máy chủ backend API (cổng 3000) đang chạy hoặc đã được khởi động trước khi kiểm thử.
 */
// Không dùng biến PORT chung: trong CI, PORT được cấp cho máy chủ API (3000).
// Cổng của web dev server khai báo riêng qua WEB_PORT.
const PORT = process.env.WEB_PORT || 5173
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
})
