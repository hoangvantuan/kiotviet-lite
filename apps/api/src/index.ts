import { serve } from '@hono/node-server'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { rateLimiter } from 'hono-rate-limiter'
import { z } from 'zod'

import { users } from '@kiotviet-lite/shared'

import { closeDbPool, db } from './db/index.js'
import { parseAllowedOrigins } from './lib/allowed-origins.js'
import { setupGracefulShutdown } from './lib/graceful-shutdown.js'
import { parseJson } from './lib/http.js'
import { initLogger, logger } from './lib/logger.js'
import { opsAlerter, serverErrorSpikeAlert, watchReadiness } from './lib/ops-monitor.js'
import { requireAuth } from './middleware/auth.middleware.js'
import { csrfProtection } from './middleware/csrf.middleware.js'
import { errorHandler } from './middleware/error-handler.js'
import { requestLoggerMiddleware } from './middleware/request-logger.middleware.js'
import { securityHeaders } from './middleware/security-headers.middleware.js'
import { createAuditRoutes } from './routes/audit.routes.js'
import { createAuthRoutes } from './routes/auth.routes.js'
import { createBrandsRoutes } from './routes/brands.routes.js'
import { createBulkExportRoutes } from './routes/bulk-export.routes.js'
import { createBulkImportJobsRoutes } from './routes/bulk-import-jobs.routes.js'
import { createBulkImportPreviewRoutes } from './routes/bulk-import-preview.routes.js'
import { createCategoriesRoutes } from './routes/categories.routes.js'
import { createCategoryDiscountsRoutes } from './routes/category-discounts.routes.js'
import { createCustomerGroupsRoutes } from './routes/customer-groups.routes.js'
import { createCustomerPricesRoutes } from './routes/customer-prices.routes.js'
import { createCustomersRoutes } from './routes/customers.routes.js'
import { createDebtAdjustmentsRoutes } from './routes/debt-adjustments.routes.js'
import { createHealthRoutes } from './routes/health.routes.js'
import { createNotificationRoutes } from './routes/notifications.routes.js'
import { createOrdersRoutes } from './routes/orders.routes.js'
import { createPosRoutes } from './routes/pos.routes.js'
import { createPriceListsRoutes } from './routes/price-lists.routes.js'
import { createPrintSettingsRoutes } from './routes/print-settings.routes.js'
import { createProductHistoryRoutes } from './routes/product-history.routes.js'
import { createProductsRoutes } from './routes/products.routes.js'
import { createPurchaseOrdersRoutes } from './routes/purchase-orders.routes.js'
import { createReceiptsRoutes } from './routes/receipts.routes.js'
import { createReportsRoutes } from './routes/reports.routes.js'
import { createStockChecksRoutes } from './routes/stock-checks.routes.js'
import { createStoreRoutes } from './routes/store.routes.js'
import { createSupplierDebtAdjustmentsRoutes } from './routes/supplier-debt-adjustments.routes.js'
import { createSupplierPaymentsRoutes } from './routes/supplier-payments.routes.js'
import { createSuppliersRoutes } from './routes/suppliers.routes.js'
import { createSyncRoutes } from './routes/sync.routes.js'
import { createUsersRoutes } from './routes/users.routes.js'
import { createVolumePricesRoutes } from './routes/volume-prices.routes.js'
import { importStorageRoot, verifyImportStorageRoot } from './services/bulk-import-jobs.service.js'
import { drainBulkImportRunner } from './services/bulk-import-runner.service.js'
import { startIdempotencyKeyCleanup } from './services/idempotency-cleanup.service.js'

// Refuse to serve any endpoint when production import storage is absent or unsafe.
if (process.env.NODE_ENV === 'production') await verifyImportStorageRoot(importStorageRoot())

const app = new Hono()

const { origins: ALLOWED_ORIGINS, warning: allowedOriginsWarning } = parseAllowedOrigins(
  process.env.ALLOWED_ORIGINS,
  process.env.NODE_ENV,
)

app.use(
  '/api/*',
  cors({
    origin: (origin) => (origin && ALLOWED_ORIGINS.includes(origin) ? origin : null),
    credentials: true,
    allowHeaders: ['Authorization', 'Content-Type', 'X-Request-Id', 'Idempotency-Key'],
    exposeHeaders: ['X-Request-Id', 'Idempotent-Replayed'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
)

app.use('*', securityHeaders)
app.use('/api/*', requestLoggerMiddleware)
app.use(
  '/api/*',
  serverErrorSpikeAlert({
    alerter: opsAlerter(),
    threshold: Number(process.env.OPS_ALERT_5XX_THRESHOLD) || 20,
  }),
)
// BM-104: request đổi trạng thái phải đến từ origin được phép hoặc cùng host
app.use('/api/*', csrfProtection({ allowedOrigins: ALLOWED_ORIGINS }))

app.onError(errorHandler)

app.get('/', (c) => {
  return c.json({ message: 'KiotViet Lite API' })
})

app.route('/api/v1/health', createHealthRoutes({ db }))

const clientDiagnosticSchema = z
  .object({
    kind: z.enum([
      'render_error',
      'offline_sync_error',
      'incremental_sync_error',
      'response_parse_error',
      'request_network_error',
    ]),
    requestId: z.string().uuid().optional(),
    clientId: z.string().uuid().optional(),
    status: z.number().int().min(100).max(599).optional(),
    code: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
      .optional(),
  })
  .strict()

app.post(
  '/api/v1/client-diagnostics',
  requireAuth(db),
  rateLimiter({
    windowMs: 60_000,
    limit: 60,
    keyGenerator: (c) => c.get('auth').userId,
  }),
  async (c) => {
    const diagnostic = await parseJson(c, clientDiagnosticSchema)
    c.get('logger').warn(
      {
        kind: diagnostic.kind,
        relatedRequestId: diagnostic.requestId,
        clientId: diagnostic.clientId,
        status: diagnostic.status,
        code: diagnostic.code,
      },
      'client diagnostic',
    )
    return c.body(null, 204)
  },
)

app.route('/api/v1/auth', createAuthRoutes({ db }))
app.route('/api/v1/users', createUsersRoutes({ db }))
app.route('/api/v1/brands', createBrandsRoutes({ db }))
app.route('/api/v1/categories', createCategoriesRoutes({ db }))
app.route('/api/v1/products', createProductsRoutes({ db }))
app.route('/api/v1/products', createProductHistoryRoutes({ db }))
app.route('/api/v1/pos', createPosRoutes({ db }))
app.route('/api/v1/customer-groups', createCustomerGroupsRoutes({ db }))
app.route('/api/v1/customers', createCustomersRoutes({ db }))
app.route('/api/v1/bulk-export', createBulkExportRoutes({ db }))
app.route('/api/v1/bulk-import', createBulkImportPreviewRoutes({ db }))
app.route('/api/v1/bulk-import-jobs', createBulkImportJobsRoutes({ db }))
app.route('/api/v1/debt-adjustments', createDebtAdjustmentsRoutes({ db }))
app.route('/api/v1/suppliers', createSuppliersRoutes({ db }))
app.route('/api/v1/supplier-debt-adjustments', createSupplierDebtAdjustmentsRoutes({ db }))
app.route('/api/v1/purchase-orders', createPurchaseOrdersRoutes({ db }))
app.route('/api/v1/receipts', createReceiptsRoutes({ db }))
app.route('/api/v1/reports', createReportsRoutes({ db }))
app.route('/api/v1/supplier-payments', createSupplierPaymentsRoutes({ db }))
app.route('/api/v1/stock-checks', createStockChecksRoutes({ db }))
app.route('/api/v1/price-lists', createPriceListsRoutes({ db }))
app.route('/api/v1/customer-prices', createCustomerPricesRoutes({ db }))
app.route('/api/v1/volume-prices', createVolumePricesRoutes({ db }))
app.route('/api/v1/category-discounts', createCategoryDiscountsRoutes({ db }))
app.route('/api/v1/store', createStoreRoutes({ db }))
app.route('/api/v1/print-settings', createPrintSettingsRoutes({ db }))
app.route('/api/v1/audit-logs', createAuditRoutes({ db }))
app.route('/api/v1/notifications', createNotificationRoutes({ db }))
app.route('/api/v1/orders', createOrdersRoutes({ db }))
app.route('/api/v1/sync', createSyncRoutes({ db }))

app.get('/api/v1/me', requireAuth(db), async (c) => {
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
      logger.error({ err }, 'logger initialization failed; using stdout fallback')
    })
    .then(() => {
      if (allowedOriginsWarning) {
        logger.warn({ allowedOrigins: ALLOWED_ORIGINS }, allowedOriginsWarning)
      }
      const server = serve({ fetch: app.fetch, port }, (info) => {
        logger.info({ port: info.port }, 'api server listening')
      })
      if (opsAlerter().enabled) logger.info('ops alerts enabled')
      watchReadiness({ db, alerter: opsAlerter() })
      // R4: xóa khóa chống trùng cũ hơn 7 ngày, lúc khởi động và mỗi 6 giờ
      startIdempotencyKeyCleanup({ db })

      // GL-11: tổng hạn 30 s (stop_grace_period của compose là 45 s). Job nhập được 15 s để
      // xong, quá hạn thì dừng tại ranh giới dòng, rollback và trả về hàng đợi (5 s),
      // pool DB đóng cưỡng bức sau 5 s.
      setupGracefulShutdown({
        server,
        logger,
        timeoutMs: 30_000,
        drain: async () => {
          await drainBulkImportRunner({ graceMs: 15_000, abortMs: 5_000 })
        },
        cleanup: async () => {
          await closeDbPool()
        },
      })
    })
}

export default app
