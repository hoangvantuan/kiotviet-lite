// Nạp vào service worker do Workbox sinh ra qua workbox.importScripts (vite.config.ts).
//
// C-01: các bản trước cache mọi GET /api/ vào 'api-cache' theo stale-while-revalidate,
// không tách theo người dùng, không xóa khi đăng xuất. cleanupOutdatedCaches của Workbox
// chỉ dọn precache, không đụng runtime cache, nên phải tự xóa ở đây, nếu không dữ liệu
// của người trước còn nằm trên mọi máy đã cài.
const LEGACY_API_CACHE = 'api-cache'

self.addEventListener('install', (event) => {
  // Còn 'api-cache' nghĩa là service worker đang chạy là bản cũ vẫn cache API. Bản cũ
  // không có lời nhắc cập nhật nên nếu chờ thì chỉ đóng hết tab mới thay được; chiếm
  // quyền ngay để chặn rò dữ liệu. Các lần cập nhật sau không còn cache này nên vẫn
  // chờ người dùng bấm cập nhật (registerType: 'prompt').
  event.waitUntil(
    caches.has(LEGACY_API_CACHE).then((exists) => (exists ? self.skipWaiting() : undefined)),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete(LEGACY_API_CACHE))
})
