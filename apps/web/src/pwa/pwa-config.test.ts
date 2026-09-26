import { describe, expect, it } from 'vitest'

import { pwaOptions } from '../../vite.config'

/**
 * C-01: bản build từng cache mọi GET `/api/` theo stale-while-revalidate vào `api-cache`,
 * không tách theo người dùng và không xóa khi đăng xuất, nên người đăng nhập sau đọc được
 * dữ liệu (kể cả báo cáo bị cấm) của người trước. OFF-18: `autoUpdate` bật skipWaiting và
 * clientsClaim, service worker mới chiếm quyền giữa lúc đang bán mà không báo.
 */
describe('cấu hình PWA (C-01, OFF-18)', () => {
  const workbox = pwaOptions.workbox!

  it('không còn quy tắc runtimeCaching nào khớp URL /api/', () => {
    const apiUrls = [
      'https://shop.example.com/api/v1/reports/revenue',
      'http://localhost:5212/api/v1/me',
    ]
    for (const rule of workbox.runtimeCaching ?? []) {
      const pattern = rule.urlPattern
      if (pattern instanceof RegExp) {
        for (const url of apiUrls) expect(pattern.test(url)).toBe(false)
      } else {
        // Quy tắc dạng chuỗi hoặc hàm khó kiểm tĩnh, không cho phép quay lại
        throw new Error(`runtimeCaching không được dùng urlPattern dạng ${typeof pattern}`)
      }
    }
  })

  it('vẫn precache app shell để mở được khi ngoại tuyến', () => {
    const globs = workbox.globPatterns?.join(',') ?? ''
    for (const ext of ['js', 'css', 'html', 'wasm', 'data']) expect(globs).toContain(ext)
  })

  it('nạp script dọn api-cache cũ vào service worker', () => {
    expect(workbox.importScripts).toContain('sw-cleanup.js')
  })

  it('không tự chiếm quyền giữa lúc bán, người dùng chọn lúc cập nhật', () => {
    expect(pwaOptions.registerType).toBe('prompt')
    expect(workbox.skipWaiting).not.toBe(true)
    expect(workbox.clientsClaim).not.toBe(true)
  })
})
