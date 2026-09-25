import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test'

/**
 * Cấu hình Playwright cho kiểm thử E2E của KiotViet Lite Web
 *
 * Lưu ý quan trọng:
 * - Kiểm thử E2E yêu cầu cơ sở dữ liệu PostgreSQL thật đã chạy db:migrate và db:seed.
 * - Không sử dụng PGlite trong bộ nhớ cho bộ kiểm thử này.
 * - Đảm bảo máy chủ backend API (cổng 3000) đang chạy hoặc đã được khởi động trước khi kiểm thử.
 *
 * Hai đích chạy cùng một bộ bài, chọn bằng E2E_TARGET (mặc định dev):
 * - dev (project chromium): vite dev, không có service worker, gọi API khác origin qua VITE_API_URL.
 * - prod (project chromium-prod): bản build production (VITE_API_URL rỗng như Dockerfile) có
 *   service worker, phục vụ bởi e2e/prod-server.mjs mô phỏng deploy/nginx.conf (/api/ proxy,
 *   SPA fallback). Bài nào mock mạng bằng page.route phải tự đặt serviceWorkers: 'block', vì
 *   request đi qua service worker không bị page.route chặn.
 * Mỗi lần chạy chỉ một đích và cần DB vừa seed: các bài ghi dữ liệu thật (bán nợ, trả hàng...)
 * nên chạy hai đích liên tiếp trên cùng DB sẽ làm lệch tiền đề của nhau.
 */
// Không dùng biến PORT chung: trong CI, PORT được cấp cho máy chủ API (3000).
// Cổng của web dev server khai báo riêng qua WEB_PORT, bản build qua WEB_PROD_PORT.
const TARGET = process.env.E2E_TARGET === 'prod' ? 'prod' : 'dev'
const PORT = process.env.WEB_PORT || 5173
const PROD_PORT = process.env.WEB_PROD_PORT || 4173
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ||
  (TARGET === 'prod' ? `http://localhost:${PROD_PORT}` : `http://localhost:${PORT}`)

const targets = {
  dev: {
    project: { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    webServer: {
      command: `pnpm run dev --port ${PORT} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  },
  prod: {
    project: {
      name: 'chromium-prod',
      use: { ...devices['Desktop Chrome'], serviceWorkers: 'allow' },
    },
    webServer: {
      // Luôn build lại để không chạy nhầm bản build cũ
      command: 'pnpm run build:e2e && node e2e/prod-server.mjs',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 300 * 1000,
      env: { WEB_PROD_PORT: String(PROD_PORT) },
    },
  },
} satisfies Record<
  string,
  {
    project: NonNullable<PlaywrightTestConfig['projects']>[number]
    webServer: NonNullable<PlaywrightTestConfig['webServer']>
  }
>

export default defineConfig({
  testDir: './e2e',
  outputDir: `test-results/${TARGET}`,
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { outputFolder: `playwright-report/${TARGET}`, open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [targets[TARGET].project],
  webServer: targets[TARGET].webServer,
})
