/**
 * BM-104: lớp chống CSRF phòng thủ chiều sâu cho request đổi trạng thái.
 *
 * Trước đây API chỉ dựa vào SameSite=Strict của cookie refresh: một trang lạ vẫn gửi được
 * POST/PUT/PATCH/DELETE tới API (trình duyệt đính kèm cookie nếu SameSite bị nới hoặc trình duyệt
 * cũ bỏ qua), máy chủ không kiểm nguồn gốc request. Test dựng đúng app production (`index.ts`).
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// index.ts dựng route nhập hàng loạt ngay lúc import, route đó đòi thư mục lưu tệp tuyệt đối
process.env.BULK_IMPORT_DIR ??= join(tmpdir(), 'kvl-bm104-bulk-import')

const { default: app } = await import('../index.js')

const EVIL = 'https://evil.example'
const DEV_WEB = 'http://localhost:5173'

async function post(path: string, headers: Record<string, string>) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: '{}',
  })
}

describe('BM-104: chặn request đổi trạng thái từ nguồn lạ', () => {
  it('origin lạ gọi /auth/logout (dùng cookie) → 403, không chạm tới handler', async () => {
    const res = await post('/api/v1/auth/logout', { Origin: EVIL, Cookie: 'kvl_refresh=abc' })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { code: string; details?: { code?: string } } }
    expect(body.error.code).toBe('FORBIDDEN')
    expect(body.error.details?.code).toBe('CSRF_ORIGIN_REJECTED')
    // Phản hồi từ chối vẫn đi qua header bảo mật chung (C-01: không cache)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
  })

  it.each(['PUT', 'PATCH', 'DELETE'])('%s từ origin lạ cũng bị chặn', async (method) => {
    const res = await app.request('/api/v1/products/00000000-0000-0000-0000-000000000000', {
      method,
      headers: { Origin: EVIL, 'Content-Type': 'application/json' },
      body: method === 'DELETE' ? undefined : '{}',
    })
    expect(res.status).toBe(403)
  })

  it('Origin "null" (iframe sandbox, file://) bị chặn', async () => {
    const res = await post('/api/v1/auth/refresh', { Origin: 'null' })
    expect(res.status).toBe(403)
  })

  it('không có Origin nhưng trình duyệt báo Sec-Fetch-Site cross-site/same-site → 403', async () => {
    for (const site of ['cross-site', 'same-site']) {
      const res = await post('/api/v1/auth/refresh', { 'Sec-Fetch-Site': site })
      expect(res.status).toBe(403)
    }
  })

  it('origin cấu hình trong ALLOWED_ORIGINS (web dev 5173 gọi API 3000) đi qua', async () => {
    const res = await post('/api/v1/client-diagnostics', {
      Origin: DEV_WEB,
      'Sec-Fetch-Site': 'same-site',
    })
    // Qua lớp CSRF, bị chặn ở bước xác thực vì không gửi token
    expect(res.status).toBe(401)
  })

  it('cùng origin qua nginx (Origin khớp Host) đi qua dù không có trong ALLOWED_ORIGINS', async () => {
    const res = await post('/api/v1/client-diagnostics', {
      Origin: 'https://shop.example.vn',
      Host: 'shop.example.vn',
      'X-Forwarded-Proto': 'https',
      'Sec-Fetch-Site': 'same-origin',
    })
    expect(res.status).toBe(401)
  })

  it('Host không kèm cổng: scheme của Origin phải khớp X-Forwarded-Proto (hoặc scheme request)', async () => {
    const downgrade = await post('/api/v1/client-diagnostics', {
      Origin: 'http://shop.example.vn',
      Host: 'shop.example.vn',
      'X-Forwarded-Proto': 'https',
    })
    expect(downgrade.status).toBe(403)
    const upgrade = await post('/api/v1/client-diagnostics', {
      Origin: 'https://shop.example.vn',
      Host: 'shop.example.vn',
      'X-Forwarded-Proto': 'http',
    })
    expect(upgrade.status).toBe(403)
    // Không có X-Forwarded-Proto thì so với scheme của chính request (app.request dùng http)
    const noProxy = await post('/api/v1/client-diagnostics', {
      Origin: 'https://shop.example.vn',
      Host: 'shop.example.vn',
    })
    expect(noProxy.status).toBe(403)
  })

  it('nginx bỏ cổng khỏi Host (web ở :8080) vẫn nhận ra cùng host; khác tên máy thì chặn', async () => {
    const ok = await post('/api/v1/client-diagnostics', {
      Origin: 'http://localhost:8080',
      Host: 'localhost',
    })
    expect(ok.status).toBe(401)
    const evil = await post('/api/v1/client-diagnostics', {
      Origin: 'http://localhost.evil.example:8080',
      Host: 'localhost',
    })
    expect(evil.status).toBe(403)
    const otherPort = await post('/api/v1/client-diagnostics', {
      Origin: 'http://shop.example.vn:9999',
      Host: 'shop.example.vn:8080',
    })
    expect(otherPort.status).toBe(403)
  })

  it('client không phải trình duyệt (không Origin, không Sec-Fetch-*) đi qua', async () => {
    const res = await post('/api/v1/client-diagnostics', {})
    expect(res.status).toBe(401)
  })

  it('GET và preflight OPTIONS không bị lớp CSRF chặn', async () => {
    // GET không đổi trạng thái: đi qua lớp CSRF, dừng ở bước xác thực
    const get = await app.request('/api/v1/products', { headers: { Origin: EVIL } })
    expect(get.status).toBe(401)
    const preflight = await app.request('/api/v1/auth/logout', {
      method: 'OPTIONS',
      headers: { Origin: EVIL, 'Access-Control-Request-Method': 'POST' },
    })
    expect(preflight.status).not.toBe(403)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
