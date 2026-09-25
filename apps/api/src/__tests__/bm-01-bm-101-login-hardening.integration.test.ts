/**
 * BM-01 (gồm GL-06): giả mạo `X-Forwarded-For` né giới hạn đăng nhập.
 * BM-101 (gồm BM-06): dò tài khoản qua chênh lệch thời gian đăng nhập và qua lỗi đăng ký.
 *
 * Bước tái hiện gốc (w6b-baomat, w7-golive): gửi liên tiếp đăng nhập sai, mỗi lần một
 * `X-Forwarded-For` khác ở đầu chuỗi, trước đây không lần nào bị 429. Đo thời gian đăng nhập
 * sai cho số có thật và số không có: trước đây chênh khoảng 40 lần.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createAuthRoutes } from '../routes/auth.routes.js'
import { REGISTER_CONFLICT_MESSAGE } from '../services/auth.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

let env: TestEnv
let app: ReturnType<typeof createAuthRoutes>

beforeAll(async () => {
  // Số vòng bcrypt đủ lớn để chênh lệch thời gian đo được ổn định (mặc định test là 4).
  process.env.BCRYPT_ROUNDS = '10'
  env = await createTestEnv()
  app = createAuthRoutes({ db: env.db })
})

afterAll(async () => {
  process.env.BCRYPT_ROUNDS = '4'
  await env.close()
})

/** Giả lập kết nối TCP từ `remoteAddress` như `@hono/node-server` đặt ở `c.env.incoming`. */
async function login(
  phone: string,
  password: string,
  opts: { remoteAddress?: string; xff?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.xff) headers['x-forwarded-for'] = opts.xff
  return app.request(
    '/login',
    { method: 'POST', headers, body: JSON.stringify({ phone, password }) },
    { incoming: { socket: { remoteAddress: opts.remoteAddress ?? '203.0.113.10' } } },
  )
}

describe('BM-01: giới hạn đăng nhập theo IP tin cậy và theo số điện thoại', () => {
  const originalNodeEnv = process.env.NODE_ENV
  beforeEach(() => {
    // Bật lại rate limit (bị bỏ qua khi NODE_ENV=test)
    process.env.NODE_ENV = 'development'
  })
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    delete process.env.TRUSTED_PROXY_HOPS
  })

  it('mặc định không tin X-Forwarded-For: đổi header mỗi lần vẫn bị 429 từ lần thứ 6', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 7; i++) {
      const res = await login('0900000101', 'saimatkhau', {
        remoteAddress: '198.51.100.1',
        xff: `203.0.${i}.1`,
      })
      statuses.push(res.status)
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401])
    expect(statuses.slice(5)).toEqual([429, 429])
  })

  it('sau nginx (TRUSTED_PROXY_HOPS=1) chỉ tin phần tử cuối do proxy nối, phần client tự khai bị bỏ qua', async () => {
    process.env.TRUSTED_PROXY_HOPS = '1'
    const statuses: number[] = []
    for (let i = 0; i < 7; i++) {
      // Mọi request cùng đi qua proxy 10.0.0.2; IP thật do proxy nối là 198.51.100.2
      const res = await login('0900000102', 'saimatkhau', {
        remoteAddress: '10.0.0.2',
        xff: `203.0.${i}.1, 198.51.100.2`,
      })
      statuses.push(res.status)
    }
    expect(statuses.slice(5)).toEqual([429, 429])

    // Client khác sau cùng proxy không bị vạ lây
    const other = await login('0900000103', 'saimatkhau', {
      remoteAddress: '10.0.0.2',
      xff: '198.51.100.3',
    })
    expect(other.status).toBe(401)
  })

  it('dò mật khẩu một số điện thoại từ nhiều IP bị chặn sau 10 lần sai', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 12; i++) {
      const res = await login(env.owner.phone, 'saimatkhau', { remoteAddress: `198.51.101.${i}` })
      statuses.push(res.status)
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true)
    expect(statuses.slice(10)).toEqual([429, 429])
  })
})

describe('BM-101: không dò được tài khoản qua đăng nhập và đăng ký', () => {
  async function medianLoginMs(phone: string): Promise<number> {
    const samples: number[] = []
    for (let i = 0; i < 5; i++) {
      const started = performance.now()
      const res = await login(phone, 'saimatkhau')
      samples.push(performance.now() - started)
      expect(res.status).toBe(401)
    }
    samples.sort((a, b) => a - b)
    return samples[2] ?? 0
  }

  it('số không tồn tại tốn thời gian bcrypt tương đương số có thật', async () => {
    // Làm nóng: lần đầu sinh hash giả
    await login('0900000000', 'saimatkhau')
    const existing = await medianLoginMs(env.owner.phone)
    const missing = await medianLoginMs('0900000009')
    // Trước khi sửa: ~1 ms so với ~50 ms (tỷ lệ ~0,02)
    expect(missing).toBeGreaterThan(existing * 0.5)
  })

  it('đăng ký số đã có trả thông báo chung, không nêu trường số điện thoại', async () => {
    const res = await app.request(
      '/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: 'Cửa hàng dò',
          ownerName: 'Người dò',
          phone: env.owner.phone,
          password: 'matkhau123',
        }),
      },
      { incoming: { socket: { remoteAddress: '203.0.113.50' } } },
    )
    expect(res.status).toBe(409)
    const body = (await res.json()) as {
      error: { code: string; message: string; details?: unknown }
    }
    expect(body.error.code).toBe('CONFLICT')
    expect(body.error.message).toBe(REGISTER_CONFLICT_MESSAGE)
    expect(body.error.details).toBeUndefined()
  })
})
