/**
 * BM-03: khóa hoặc hạ quyền nhân viên phải vô hiệu access token còn hạn ngay lập tức.
 *
 * Theo bước tái hiện gốc (w6-baomat, w6b-baomat): (1) nhân viên có access token còn hạn,
 * (2) chủ cửa hàng khóa nhân viên, (3) token cũ gọi `/customers`, `/orders`, `/pos/products/search`;
 * (4) chủ hạ quản lý xuống nhân viên, token quản lý cũ gọi `/reports/dashboard`.
 */
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { errorHandler } from '../middleware/error-handler.js'
import { createCustomersRoutes } from '../routes/customers.routes.js'
import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createPosRoutes } from '../routes/pos.routes.js'
import { createReportsRoutes } from '../routes/reports.routes.js'
import { createUsersRoutes } from '../routes/users.routes.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

let env: TestEnv
let app: Hono

beforeEach(async () => {
  env = await createTestEnv()
  app = new Hono()
  app.onError(errorHandler)
  app.route('/users', createUsersRoutes({ db: env.db }))
  app.route('/customers', createCustomersRoutes({ db: env.db }))
  app.route('/orders', createOrdersRoutes({ db: env.db }))
  app.route('/pos', createPosRoutes({ db: env.db }))
  app.route('/reports', createReportsRoutes({ db: env.db }))
})

afterEach(async () => {
  await env.close()
})

describe('BM-03: trạng thái và vai trò hiện hành áp dụng ngay cho access token cũ', () => {
  it('khóa nhân viên: token cũ bị 401 ở mọi route, mở khóa thì dùng lại được', async () => {
    const staffToken = env.staff.authHeader
    expect((await app.request('/customers', { headers: staffToken })).status).toBe(200)

    const lock = await app.request(`/users/${env.staff.id}/lock`, {
      method: 'POST',
      headers: env.owner.authHeader,
    })
    expect(lock.status).toBe(200)

    for (const path of ['/customers', '/orders', '/pos/products/search?q=a']) {
      const res = await app.request(path, { headers: staffToken })
      expect(res.status, path).toBe(401)
    }

    const unlock = await app.request(`/users/${env.staff.id}/unlock`, {
      method: 'POST',
      headers: env.owner.authHeader,
    })
    expect(unlock.status).toBe(200)
    expect((await app.request('/customers', { headers: staffToken })).status).toBe(200)
  })

  it('hạ quản lý xuống nhân viên: token quản lý cũ bị 403 ở route chỉ dành cho quản lý', async () => {
    const managerToken = env.manager.authHeader
    expect((await app.request('/reports/dashboard', { headers: managerToken })).status).toBe(200)

    const demote = await app.request(`/users/${env.manager.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...env.owner.authHeader },
      body: JSON.stringify({ role: 'staff' }),
    })
    expect(demote.status).toBe(200)

    expect((await app.request('/reports/dashboard', { headers: managerToken })).status).toBe(403)
    // Vẫn là nhân viên hợp lệ nên các route của nhân viên dùng được bình thường
    expect((await app.request('/customers', { headers: managerToken })).status).toBe(200)
  })
})
