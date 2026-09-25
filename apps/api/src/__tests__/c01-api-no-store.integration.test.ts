import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// index.ts dựng route nhập hàng loạt ngay lúc import, route đó đòi thư mục lưu tệp tuyệt đối,
// nên phải đặt biến môi trường trước khi nạp app.
process.env.BULK_IMPORT_DIR ??= join(tmpdir(), 'kvl-c01-bulk-import')

const { default: app } = await import('../index.js')

/**
 * C-01 (gộp C-02, OFF-01, BM-04, POS-05, UX-02): phản hồi `/api/` từng bị service worker
 * lưu vào `api-cache` rồi trả cho người đăng nhập sau trên cùng máy. Phía máy chủ phải
 * cấm mọi tầng cache (trình duyệt, service worker, proxy) giữ phản hồi API, kể cả phản
 * hồi lỗi, vì một 200 của chủ cửa hàng hay một 403 cũ đều không được tái sử dụng.
 */
describe('C-01: mọi phản hồi /api/ đặt Cache-Control: private, no-store', () => {
  const cases: Array<{ name: string; path: string; init?: RequestInit; status: number }> = [
    // Liveness không chạm DB; readiness (/api/v1/health) cần DB thật nên không dùng ở đây.
    { name: 'GET thành công', path: '/api/v1/health/live', status: 200 },
    { name: 'GET chưa xác thực', path: '/api/v1/me', status: 401 },
    { name: 'GET route không tồn tại', path: '/api/v1/khong-ton-tai', status: 404 },
    {
      name: 'POST lỗi kiểm tra dữ liệu',
      path: '/api/v1/auth/login',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      status: 400,
    },
  ]

  for (const tc of cases) {
    it(`${tc.name} (${tc.path})`, async () => {
      const res = await app.request(tc.path, tc.init)
      expect(res.status).toBe(tc.status)
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    })
  }
})
