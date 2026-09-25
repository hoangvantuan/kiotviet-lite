import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { verifyWebhookSignature } from '../transports/webhook.js'

// deploy/scripts/lib/alert.sh là bản shell của ops-alert.ts cho backup và monitor.sh; test
// chạy thật script với một `curl` giả trong PATH ghi lại tham số và cấu hình nhận qua stdin.
const SCRIPT = resolve(import.meta.dirname, '../../../../deploy/scripts/lib/alert.sh')

type Call = { url: string; headers: Record<string, string>; body: string; args: string[] }

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kvl-alert-sh-'))
  writeFileSync(
    join(dir, 'curl'),
    `#!/bin/sh
n=$(ls "$CALL_DIR" | grep -c '\\.args$')
printf '%s\\0' "$@" > "$CALL_DIR/$n.args"
cat > "$CALL_DIR/$n.cfg"
printf '%s' "\${FAKE_STATUS:-200}"
`,
  )
  chmodSync(join(dir, 'curl'), 0o755)
  // openssl giả ghi lại tham số rồi chuyển cho openssl thật, để kiểm secret không nằm trên argv.
  writeFileSync(
    join(dir, 'openssl'),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$CALL_DIR/openssl.argv"
PATH=$REAL_PATH exec openssl "$@"
`,
  )
  chmodSync(join(dir, 'openssl'), 0o755)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function run(
  env: Record<string, string>,
  args = ['backup.failed', 'error', 'Tiêu đề', 'Nội dung'],
) {
  execFileSync('sh', [SCRIPT, ...args], {
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      REAL_PATH: process.env.PATH!,
      CALL_DIR: dir,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function calls(): Call[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.args'))
    .sort()
    .map((f) => {
      const args = readFileSync(join(dir, f), 'utf8').split('\0').slice(0, -1)
      const cfg = readFileSync(join(dir, f.replace('.args', '.cfg')), 'utf8')
      const headers: Record<string, string> = {}
      let url = ''
      for (const line of cfg.split('\n')) {
        const m = /^(url|header) = "(.*)"$/.exec(line)
        if (!m) continue
        if (m[1] === 'url') url = m[2]!
        else {
          const [name, ...rest] = m[2]!.split(': ')
          headers[name!] = rest.join(': ')
        }
      }
      return { url, headers, body: args[args.indexOf('--data-binary') + 1]!, args }
    })
}

const telegram = { OPS_ALERT_TELEGRAM_BOT_TOKEN: '123:SECRET', OPS_ALERT_TELEGRAM_CHAT_ID: '-100' }
const webhook = {
  OPS_ALERT_WEBHOOK_URL: 'https://hooks.example.com/kvl',
  OPS_ALERT_WEBHOOK_SECRET: 'whsec',
}

describe('deploy/scripts/lib/alert.sh', () => {
  it('gửi Telegram cùng định dạng với alerter của API, token không nằm trong tham số tiến trình', () => {
    const title = 'Sao lưu "lỗi" \\ đĩa'
    const body = 'Dòng 1\nDòng 2\ttab'
    run(telegram, ['backup.failed', 'error', title, body])
    const [call] = calls()
    expect(call!.url).toBe('https://api.telegram.org/bot123:SECRET/sendMessage')
    expect(call!.args.join(' ')).not.toContain('SECRET')
    const payload = JSON.parse(call!.body) as { chat_id: string; text: string }
    expect(payload.chat_id).toBe('-100')
    expect(payload.text).toMatch(
      /^\[ERROR\] kiotviet-lite: Sao lưu "lỗi" \\ đĩa\nDòng 1\nDòng 2\ttab\n\n\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/,
    )
  })

  it('webhook có chữ ký HMAC mà verifyWebhookSignature chấp nhận, secret không nằm trên argv', () => {
    run({ ...webhook, OPS_ALERT_SOURCE: 'cua-hang-a' })
    const [call] = calls()
    const opensslArgv = readFileSync(join(dir, 'openssl.argv'), 'utf8')
    expect(opensslArgv).toContain('dgst')
    expect(opensslArgv).not.toContain(webhook.OPS_ALERT_WEBHOOK_SECRET)
    expect(call!.url).toBe(webhook.OPS_ALERT_WEBHOOK_URL)
    const payload = JSON.parse(call!.body) as Record<string, string>
    expect(payload).toMatchObject({
      source: 'cua-hang-a',
      key: 'backup.failed',
      severity: 'error',
      title: 'Tiêu đề',
      body: 'Nội dung',
    })
    expect(
      verifyWebhookSignature({
        signature: call!.headers['X-KVL-Signature']!,
        timestamp: call!.headers['X-KVL-Timestamp']!,
        nonce: call!.headers['X-KVL-Nonce']!,
        body: call!.body,
        secret: webhook.OPS_ALERT_WEBHOOK_SECRET,
      }),
    ).toEqual({ valid: true })
  })

  it('HMAC đúng với secret dài hơn một khối và có ký tự đặc biệt', () => {
    const secret = `${'k'.repeat(80)}\\%s"6\\`
    run({ ...webhook, OPS_ALERT_WEBHOOK_SECRET: secret })
    const [call] = calls()
    expect(
      verifyWebhookSignature({
        signature: call!.headers['X-KVL-Signature']!,
        timestamp: call!.headers['X-KVL-Timestamp']!,
        nonce: call!.headers['X-KVL-Nonce']!,
        body: call!.body,
        secret,
      }),
    ).toEqual({ valid: true })
  })

  it('OPS_ALERT_ENABLED=false hoặc webhook không phải https thì không gửi gì', () => {
    run({ ...telegram, OPS_ALERT_ENABLED: 'false' })
    run({ OPS_ALERT_WEBHOOK_URL: 'http://hooks.example.com/kvl' })
    expect(calls()).toHaveLength(0)
  })

  it('giới hạn lặp theo khóa, gửi hỏng thì không tính để lần sau thử lại', () => {
    const state = { ...telegram, OPS_ALERT_STATE_DIR: join(dir, 'state') }
    run({ ...state, FAKE_STATUS: '500' })
    run(state)
    run(state)
    run(state, ['disk.full', 'warn', 'Đĩa', 'đầy'])
    run({ ...state, OPS_ALERT_FORCE: '1' })
    expect(calls()).toHaveLength(4)
  })
})
