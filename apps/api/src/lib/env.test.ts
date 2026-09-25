/**
 * GL-05: API phải từ chối khởi động ở production với secret mẫu công khai hoặc secret yếu.
 *
 * Bước tái hiện gốc (w7-golive): chạy API với `NODE_ENV=production` và JWT secret chép nguyên
 * từ `.env.production.example`, trước đây API vẫn chạy bình thường. Test nạp `env.ts` trong
 * tiến trình con giống lúc API khởi động (secret được kiểm ngay khi import).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const apiRoot = resolve(__dirname, '../..')
const repoRoot = resolve(apiRoot, '../..')
const tsx = resolve(apiRoot, 'node_modules/.bin/tsx')

function readExampleEnv(): Record<string, string> {
  const text = readFileSync(resolve(repoRoot, '.env.production.example'), 'utf8')
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m?.[1]) out[m[1]] = m[2] ?? ''
  }
  return out
}

const STRONG_ACCESS = 'q8V3xN1zK7pL0sT5wY2bR9dF4gH6jM3c'
const STRONG_REFRESH = 'Z2mB7vC1xQ9nW4eR6tY3uI8oP5aS0dFg'
const NOTIFY_KEY = '3f9c1a7e5b2d8046c1e9a3f7b5d2086e4c1a9f3e7b5d20864c1e9a3f7b5d2086'

function boot(overrides: Record<string, string>) {
  const result = spawnSync(tsx, ['src/lib/env.ts'], {
    cwd: apiRoot,
    env: {
      PATH: process.env.PATH ?? '',
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: STRONG_ACCESS,
      JWT_REFRESH_SECRET: STRONG_REFRESH,
      NOTIFICATION_CONFIG_KEY: NOTIFY_KEY,
      ...overrides,
    },
    encoding: 'utf8',
  })
  return { code: result.status, output: `${result.stdout}${result.stderr}` }
}

describe('GL-05: kiểm secret khi khởi động production', () => {
  it('đối chứng: secret ngẫu nhiên mạnh thì khởi động được', () => {
    expect(boot({}).code).toBe(0)
  })

  it('từ chối JWT secret chép nguyên từ .env.production.example', () => {
    const example = readExampleEnv()
    const res = boot({
      JWT_ACCESS_SECRET: example.JWT_ACCESS_SECRET ?? '',
      JWT_REFRESH_SECRET: example.JWT_REFRESH_SECRET ?? '',
    })
    expect(res.code).not.toBe(0)
    expect(res.output).toContain('JWT_ACCESS_SECRET is a public placeholder value')
  })

  it('từ chối secret yếu (chuỗi lặp) và hai secret trùng nhau', () => {
    expect(boot({ JWT_REFRESH_SECRET: 'a'.repeat(40) }).output).toContain(
      'JWT_REFRESH_SECRET is too weak',
    )
    expect(boot({ JWT_REFRESH_SECRET: STRONG_ACCESS }).output).toContain('must be different')
  })

  it('từ chối NOTIFICATION_CONFIG_KEY mẫu khi có bật', () => {
    expect(boot({ NOTIFICATION_CONFIG_KEY: 'change-me-notification-key' }).code).not.toBe(0)
  })

  it('GL-15: production thiếu NOTIFICATION_CONFIG_KEY thì báo lỗi khởi động rõ ràng', () => {
    const res = boot({ NOTIFICATION_CONFIG_KEY: '' })
    expect(res.code).not.toBe(0)
    expect(res.output).toContain('NOTIFICATION_CONFIG_KEY is required in production')
    expect(res.output).toContain('openssl rand -hex 32')
  })

  it('GL-15: NOTIFICATION_CONFIG_KEY sai định dạng (không phải 64 ký tự hex) bị từ chối ở mọi môi trường', () => {
    for (const NODE_ENV of ['production', 'development']) {
      const res = boot({ NODE_ENV, NOTIFICATION_CONFIG_KEY: 'q8V3xN1zK7pL0sT5wY2bR9dF4gH6jM3c' })
      expect(res.code).not.toBe(0)
      expect(res.output).toContain('NOTIFICATION_CONFIG_KEY must be 64 hex characters')
    }
  })

  it('ngoài production không chặn secret dev/test', () => {
    const res = boot({
      NODE_ENV: 'development',
      JWT_ACCESS_SECRET: 'test-access-secret-min-32-chars-please-change',
      JWT_REFRESH_SECRET: 'test-refresh-secret-min-32-chars-please-change',
      NOTIFICATION_CONFIG_KEY: '',
    })
    expect(res.code).toBe(0)
  })
})
