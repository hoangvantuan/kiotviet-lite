import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { errorHandler } from './error-handler.js'

/** Lỗi driver thật bị drizzle bọc trong `cause`, như khi một câu truy vấn thất bại. */
function driverError(code: string) {
  return new Error('Failed query: update "customers" ...', {
    cause: Object.assign(new Error('deadlock detected'), { code }),
  })
}

function appThrowing(err: unknown) {
  const app = new Hono()
  app.onError(errorHandler)
  app.get('/', () => {
    throw err
  })
  return app
}

describe('errorHandler: xung đột transaction của Postgres', () => {
  it.each(['40P01', '40001'])('mã %s trả 409 để người dùng thử lại', async (code) => {
    const res = await appThrowing(driverError(code)).request('/')
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: {
        code: 'CONFLICT',
        message: 'Hệ thống đang bận xử lý giao dịch khác, vui lòng thử lại',
      },
    })
  })

  it('lỗi Postgres khác vẫn là 500', async () => {
    const res = await appThrowing(driverError('23514')).request('/')
    expect(res.status).toBe(500)
  })
})
