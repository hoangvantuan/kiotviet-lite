import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

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
    origin: (origin) => (origin && ALLOWED_ORIGINS.includes(origin) ? origin : ''),
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

app.get('/api/v1/me', requireAuth, (c) => {
  const auth = c.get('auth')
  return c.json({ data: auth })
})

const port = Number(process.env.PORT) || 3000

if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`API server running at http://localhost:${info.port}`)
  })
}

export default app
