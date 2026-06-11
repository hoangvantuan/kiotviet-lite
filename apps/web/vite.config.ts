import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        // PGlite wasm ~9MB và bundle chính ~3MB vượt trần mặc định 2MiB;
        // app offline-first nên vẫn phải precache các file này
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 3600 },
            },
          },
        ],
      },
    }),
  ],
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
})
