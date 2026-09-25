import { lookup as dnsLookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

/**
 * Chặn SSRF cho webhook do chủ cửa hàng tự nhập (GL-15): chỉ https, không gửi tới loopback,
 * mạng nội bộ, link-local (gồm metadata đám mây 169.254.169.254) hay dải dành riêng.
 * Kiểm cả lúc lưu cấu hình lẫn ngay trước mỗi lần gửi, vì bản ghi DNS có thể đổi sau khi lưu.
 */
// Hai danh sách riêng: BlockList đối chiếu IPv4 với cả luật IPv6 dạng ::ffff:0:0/96, nên để chung
// thì mọi địa chỉ IPv4 đều bị coi là nội bộ
const blockedV4 = new BlockList()
const blockedV6 = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedV4.addSubnet(net, prefix, 'ipv4')
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  // IPv4 nhúng trong IPv6 (::ffff:a.b.c.d, ::a.b.c.d, NAT64) có thể trỏ về địa chỉ nội bộ
  ['::ffff:0:0', 96],
  ['::', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  // Teredo và 6to4 đóng gói IPv4 tuỳ ý (2002:7f00:1:: là 127.0.0.1)
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  blockedV6.addSubnet(net, prefix, 'ipv6')
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return blockedV4.check(address, 'ipv4')
  if (family === 6) return blockedV6.check(address, 'ipv6')
  return true
}

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.home.arpa']

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (host === 'localhost' || host === 'metadata') return true
  return BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

export type WebhookUrlRejectReason =
  | 'INVALID_URL'
  | 'NOT_HTTPS'
  | 'HAS_CREDENTIALS'
  | 'PORT_NOT_ALLOWED'
  | 'PRIVATE_HOST'
  | 'DNS_FAILED'

export type WebhookUrlCheck = { ok: true; url: URL } | { ok: false; reason: WebhookUrlRejectReason }

/** Kiểm cú pháp, không tra DNS. Trình phân tích URL chuẩn hoá sẵn `2130706433`, `0x7f.0.0.1` về dạng chấm. */
export function checkWebhookUrl(raw: string): WebhookUrlCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'INVALID_URL' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'NOT_HTTPS' }
  if (url.username || url.password) return { ok: false, reason: 'HAS_CREDENTIALS' }
  // Chỉ cổng 443 (URL chuẩn hoá `:443` thành rỗng): cổng tuỳ ý biến "Gửi thử" thành công cụ dò cổng
  if (url.port !== '') return { ok: false, reason: 'PORT_NOT_ALLOWED' }
  const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname
  if (!host || isBlockedHostname(host)) return { ok: false, reason: 'PRIVATE_HOST' }
  if (isIP(host) && isBlockedAddress(host)) return { ok: false, reason: 'PRIVATE_HOST' }
  return { ok: true, url }
}

export type HostLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>

const defaultLookup: HostLookup = (hostname) => dnsLookup(hostname, { all: true, verbatim: true })

/** Kiểm cú pháp rồi tra DNS: mọi địa chỉ phân giải được đều phải là địa chỉ công khai. */
export async function checkWebhookTarget(
  raw: string,
  lookup: HostLookup = defaultLookup,
): Promise<{ ok: true } | { ok: false; reason: WebhookUrlRejectReason }> {
  const syntax = checkWebhookUrl(raw)
  if (!syntax.ok) return syntax
  const host = syntax.url.hostname.startsWith('[')
    ? syntax.url.hostname.slice(1, -1)
    : syntax.url.hostname
  if (isIP(host)) return { ok: true }

  let addresses: Array<{ address: string }>
  try {
    addresses = await lookup(host)
  } catch {
    return { ok: false, reason: 'DNS_FAILED' }
  }
  if (addresses.length === 0) return { ok: false, reason: 'DNS_FAILED' }
  if (addresses.some((a) => isBlockedAddress(a.address))) {
    return { ok: false, reason: 'PRIVATE_HOST' }
  }
  return { ok: true }
}
