import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'
import { VitePWA, type VitePWAOptions } from 'vite-plugin-pwa'

export const pwaOptions: Partial<VitePWAOptions> = {
  // Không dùng 'autoUpdate': chế độ đó bật skipWaiting + clientsClaim, service worker mới
  // chiếm quyền giữa lúc đang bán (OFF-18). Ở chế độ prompt, app báo có bản mới và để
  // người dùng chọn lúc tải lại (xem src/pwa/UpdatePrompt.tsx).
  registerType: 'prompt',
  includeAssets: ['favicon.ico', 'icons/*.svg', 'icons/*.png'],
  manifest: {
    name: 'KiotViet Lite',
    short_name: 'KVLite',
    description: 'Phần mềm quản lý bán hàng POS offline-first',
    start_url: '/',
    display: 'standalone',
    theme_color: '#2563EB',
    background_color: '#ffffff',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192x192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { src: '/icons/icon-512x512.svg', sizes: '512x512', type: 'image/svg+xml' },
      {
        src: '/icons/icon-512x512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  },
  workbox: {
    // OFF-03: 'data' là gói tệp hệ thống của PGlite (pglite-*.data, khoảng 5MB). Thiếu nó thì tải
    // lại khi mất mạng không mở được PGlite, không đọc được hàng chờ đơn
    globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,data}'],
    // Script nạp bằng importScripts, không precache
    globIgnores: ['**/sw-cleanup.js'],
    // PGlite wasm ~9MB và bundle chính ~3MB vượt trần mặc định 2MiB;
    // app offline-first nên vẫn phải precache các file này
    maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
    // C-01: KHÔNG cache phản hồi /api/ ở service worker. Phản hồi API gắn với người đang
    // đăng nhập; dữ liệu ngoại tuyến đúng nghĩa lấy từ PGlite. sw-cleanup.js xóa
    // 'api-cache' mà các bản cũ để lại (cleanupOutdatedCaches chỉ dọn precache).
    importScripts: ['sw-cleanup.js'],
  },
}

export default defineConfig({
  plugins: [react(), VitePWA(pwaOptions)],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: './postcss.config.js',
  },
  server: {
    port: 5173,
  },
  // OFF-04: worker PGlite dùng import động và top-level await, định dạng iife mặc định không chạy được
  worker: {
    format: 'es',
  },
})
