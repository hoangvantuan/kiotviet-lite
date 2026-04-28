import { serve } from '@hono/node-server'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { users } from '@kiotviet-lite/shared'

import { db } from './db/index.js'
import { initLogger } from './lib/logger.js'
import { requireAuth } from './middleware/auth.middleware.js'
import { errorHandler } from './middleware/error-handler.js'
import { requestLoggerMiddleware } from './middleware/request-logger.middleware.js'
import { createAuditRoutes } from './routes/audit.routes.js'
import { createAuthRoutes } from './routes/auth.routes.js'
import { createCategoriesRoutes } from './routes/categories.routes.js'
import { createNotificationRoutes } from './routes/notifications.routes.js'
import { createProductsRoutes } from './routes/products.routes.js'
import { createStoreRoutes } from './routes/store.routes.js'
import { createUsersRoutes } from './routes/users.routes.js'

const app = new Hono()

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:5174'
)
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

app.use('/api/*', requestLoggerMiddleware)

app.onError(errorHandler)

app.get('/', (c) => {
  return c.json({ message: 'KiotViet Lite API' })
})

app.get('/api/v1/health', (c) => {
  return c.json({ status: 'ok' })
})

app.route('/api/v1/auth', createAuthRoutes({ db }))
app.route('/api/v1/users', createUsersRoutes({ db }))
app.route('/api/v1/categories', createCategoriesRoutes({ db }))
app.route('/api/v1/products', createProductsRoutes({ db }))
app.route('/api/v1/store', createStoreRoutes({ db }))
app.route('/api/v1/audit-logs', createAuditRoutes({ db }))
app.route('/api/v1/notifications', createNotificationRoutes({ db }))

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
  initLogger()
    .catch((err) => {
      console.error('Failed to initialize logger, using fallback:', err)
    })
    .then(() => {
      serve({ fetch: app.fetch, port }, (info) => {
        console.log(`API server running at http://localhost:${info.port}`)
      })
    })
}

export default app
