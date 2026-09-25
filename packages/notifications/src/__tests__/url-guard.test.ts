import { describe, expect, it } from 'vitest'

import { checkWebhookTarget, checkWebhookUrl, isBlockedAddress } from '../url-guard.js'

type Lookup = NonNullable<Parameters<typeof checkWebhookTarget>[1]>

function fakeLookup(map: Record<string, string[]>): Lookup {
  return async (hostname) => {
    const addrs = map[hostname]
    if (!addrs) throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    return addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
  }
}

describe('GL-15: chặn SSRF khi cấu hình webhook', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.5',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    // 6to4 và Teredo nhúng IPv4 tuỳ ý, NAT64 cục bộ
    '2002:7f00:1::',
    '2002:a9fe:a9fe::1',
    '2001:0:4136:e378:8000:63bf:3fff:fdd2',
    '64:ff9b:1::a9fe:a9fe',
  ])('địa chỉ nội bộ %s bị chặn', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true)
  })

  it.each(['1.1.1.1', '93.184.215.14', '2606:4700:4700::1111'])(
    'địa chỉ công khai %s được phép',
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false)
    },
  )

  it.each([
    ['http://hooks.example.com/x', 'NOT_HTTPS'],
    ['ftp://hooks.example.com/x', 'NOT_HTTPS'],
    ['không phải url', 'INVALID_URL'],
    ['https://user:pass@hooks.example.com/x', 'HAS_CREDENTIALS'],
    ['https://localhost/x', 'PRIVATE_HOST'],
    ['https://api.localhost/x', 'PRIVATE_HOST'],
    ['https://metadata.google.internal/computeMetadata/v1/', 'PRIVATE_HOST'],
    ['https://127.0.0.1/x', 'PRIVATE_HOST'],
    ['https://2130706433/x', 'PRIVATE_HOST'],
    ['https://0x7f.0.0.1/x', 'PRIVATE_HOST'],
    ['https://[::ffff:7f00:1]/x', 'PRIVATE_HOST'],
    ['https://169.254.169.254/latest/meta-data/', 'PRIVATE_HOST'],
    // Chỉ cổng 443: "Gửi thử" không được thành công cụ dò cổng
    ['https://hooks.example.com:8443/x', 'PORT_NOT_ALLOWED'],
    ['https://93.184.215.14:22/x', 'PORT_NOT_ALLOWED'],
  ])('%s bị từ chối (%s)', (url, reason) => {
    expect(checkWebhookUrl(url)).toEqual({ ok: false, reason })
  })

  it('https tới tên miền công khai hợp lệ về cú pháp', () => {
    expect(checkWebhookUrl('https://hooks.example.com/kvl?x=1')).toMatchObject({ ok: true })
    expect(checkWebhookUrl('https://hooks.example.com:443/kvl')).toMatchObject({ ok: true })
  })

  it('tên miền phân giải ra địa chỉ nội bộ bị chặn (kể cả khi chỉ một bản ghi là nội bộ)', async () => {
    const lookup = fakeLookup({
      'rebind.example.com': ['10.0.0.8'],
      'mixed.example.com': ['93.184.215.14', '127.0.0.1'],
    })
    expect(await checkWebhookTarget('https://rebind.example.com/h', lookup)).toEqual({
      ok: false,
      reason: 'PRIVATE_HOST',
    })
    expect(await checkWebhookTarget('https://mixed.example.com/h', lookup)).toEqual({
      ok: false,
      reason: 'PRIVATE_HOST',
    })
  })

  it('tên miền không phân giải được bị từ chối, tên miền công khai được phép', async () => {
    const lookup = fakeLookup({ 'hooks.example.com': ['93.184.215.14'] })
    expect(await checkWebhookTarget('https://nx.example.com/h', lookup)).toEqual({
      ok: false,
      reason: 'DNS_FAILED',
    })
    expect(await checkWebhookTarget('https://hooks.example.com/h', lookup)).toEqual({ ok: true })
  })

  it('địa chỉ IP công khai viết thẳng không cần tra DNS', async () => {
    const lookup: Lookup = async () => {
      throw new Error('không được gọi')
    }
    expect(await checkWebhookTarget('https://93.184.215.14/h', lookup)).toEqual({ ok: true })
  })
})
