import { expect, type Page } from '@playwright/test'

/**
 * Chờ tab mở xong cơ sở dữ liệu ngoại tuyến (PGlite) rồi mới cắt mạng. Đích dev không có service
 * worker: cắt mạng lúc worker PGlite còn đang tải wasm thì tới khi có mạng lại mới mở được.
 */
export async function waitForOfflineDB(page: Page) {
  await expect(page.locator('html[data-offline-db="ready"]')).toHaveCount(1, { timeout: 30_000 })
}
