// Máy chủ tĩnh cho project Playwright "chromium-prod" (GL-14).
// Mô phỏng deploy/nginx.conf để E2E chạy trên bản build production có service worker:
// - /api/ proxy sang API (giữ Host, thêm X-Forwarded-*), body upload đi thẳng qua stream
// - phần web (ngoài /api/) có CSP và header bảo mật như nginx, để E2E bắt được vi phạm CSP
// - /assets/ cache dài hạn, thiếu file thì 404; tệp không hash (index.html, sw.js...) no-cache
// - còn lại: file có thật thì trả file, không thì SPA fallback về index.html
// Đổi deploy/nginx.conf thì phải sửa tay ở đây cho khớp.
// Chỉ dùng thư viện chuẩn của Node để không thêm phụ thuộc.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(
  process.env.E2E_PROD_DIST ??
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist-e2e'),
)
const PORT = Number(process.env.WEB_PROD_PORT ?? 4173)
const API = new URL(process.env.E2E_API_URL ?? 'http://localhost:3000')
const PROXY_READ_TIMEOUT_MS = 90_000

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
}

// Giống hệt các add_header ... always trong location / của deploy/nginx.conf
const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=()',
}
const NO_CACHE = { 'cache-control': 'no-cache' }
const IMMUTABLE = { 'cache-control': 'public, max-age=31536000, immutable' }

try {
  await stat(path.join(ROOT, 'index.html'))
} catch {
  console.error(
    `Không thấy ${ROOT}/index.html. Chạy "pnpm --filter @kiotviet-lite/web build:e2e" trước.`,
  )
  process.exit(1)
}

function proxyToApi(req, res) {
  const upstream = http.request(
    {
      protocol: API.protocol,
      hostname: API.hostname,
      port: API.port,
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        'x-real-ip': req.socket.remoteAddress ?? '',
        'x-forwarded-for': req.socket.remoteAddress ?? '',
        'x-forwarded-proto': 'http',
      },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
      upstreamRes.pipe(res)
    },
  )
  // Như proxy_read_timeout 90s của nginx: API im lặng quá lâu thì trả 504 (trang HTML, không phải JSON)
  upstream.setTimeout(PROXY_READ_TIMEOUT_MS, () => {
    if (!res.headersSent) res.writeHead(504, { 'content-type': 'text/html' })
    res.end('<html><body>504 Gateway Time-out</body></html>')
    upstream.destroy()
  })
  upstream.on('error', () => {
    if (res.writableEnded) return
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
    res.end('502 Bad Gateway')
  })
  req.pipe(upstream)
}

async function sendFile(res, filePath, headers = {}) {
  const info = await stat(filePath)
  res.writeHead(200, {
    'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
    'content-length': info.size,
    ...SECURITY_HEADERS,
    ...headers,
  })
  createReadStream(filePath).pipe(res)
}

async function resolveFile(pathname) {
  // Chặn thoát khỏi ROOT qua ../
  const filePath = path.join(ROOT, path.normalize(decodeURIComponent(pathname)))
  if (!filePath.startsWith(ROOT)) return null
  try {
    return (await stat(filePath)).isFile() ? filePath : null
  } catch {
    return null
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')
  try {
    if (pathname.startsWith('/api/')) return proxyToApi(req, res)

    if (pathname.startsWith('/assets/')) {
      const file = await resolveFile(pathname)
      // nginx đặt Cache-Control không kèm always: 404 chỉ có header bảo mật
      if (!file) return res.writeHead(404, SECURITY_HEADERS).end()
      return await sendFile(res, file, IMMUTABLE)
    }

    const file = await resolveFile(pathname)
    return await sendFile(res, file ?? path.join(ROOT, 'index.html'), NO_CACHE)
  } catch (error) {
    console.error(error)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  }
})

server.listen(PORT, () => {
  console.log(`prod-server: http://localhost:${PORT} (dist ${ROOT}, /api/ -> ${API.origin})`)
})
