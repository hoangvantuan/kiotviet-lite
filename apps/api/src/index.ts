import { serve } from '@hono/node-server'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { users } from '@kiotviet-lite/shared'

import { db } from './db/index.js'
import { requireAuth } from './middleware/auth.middleware.js'
import { errorHandler } from './middleware/error-handler.js'
import { createAuthRoutes } from './routes/auth.routes.js'

const app = new Hono()

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())

app.use(
  '/api/*',
  cors({
    origin: (origin) => (origin && ALLOWED_ORIGINS.includes(origin) ? origin : null),
    credentials: true,
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
)

app.onError(errorHandler)

app.get('/', (c) => {
  return c.json({ message: 'KiotViet Lite API' })
})

app.get('/api/v1/health', (c) => {
  return c.json({ status: 'ok' })
})

app.route('/api/v1/auth', createAuthRoutes({ db }))

app.get('/api/v1/me', requireAuth, async (c) => {
  const auth = c.get('auth')
  const user = await db.query.users.findFirst({
    where: eq(users.id, auth.userId),
  })
  if (!user || !user.isActive) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Tài khoản không khả dụng' } }, 401)
  }
  return c.json({
    data: {
      id: user.id,
      storeId: user.storeId,
      name: user.name,
      phone: user.phone,
      role: user.role,
    },
  })
})

const port = Number(process.env.PORT) || 3000

if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`API server running at http://localhost:${info.port}`)
  })
}

export default app
