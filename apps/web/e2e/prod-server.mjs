// Máy chủ tĩnh cho project Playwright "chromium-prod" (GL-14).
// Mô phỏng deploy/nginx.conf để E2E chạy trên bản build production có service worker:
// - /api/ proxy sang API (giữ Host, thêm X-Forwarded-*), body upload đi thẳng qua stream
// - /sw.js không cache
// - /assets/ cache dài hạn, thiếu file thì 404
// - còn lại: file có thật thì trả file, không thì SPA fallback về index.html
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
  upstream.on('error', () => {
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

    if (pathname === '/sw.js') {
      const file = await resolveFile(pathname)
      if (!file) return res.writeHead(404).end()
      return await sendFile(res, file, { 'cache-control': 'no-cache' })
    }

    if (pathname.startsWith('/assets/')) {
      const file = await resolveFile(pathname)
      if (!file) return res.writeHead(404).end()
      return await sendFile(res, file, { 'cache-control': 'public, immutable, max-age=31536000' })
    }

    const file = await resolveFile(pathname)
    return await sendFile(res, file ?? path.join(ROOT, 'index.html'))
  } catch (error) {
    console.error(error)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  }
})

server.listen(PORT, () => {
  console.log(`prod-server: http://localhost:${PORT} (dist ${ROOT}, /api/ -> ${API.origin})`)
})
