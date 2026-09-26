import { and, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { createHash } from 'node:crypto'

import { idempotencyKeys } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import type { ServiceTransaction } from '../services/service-transaction.js'

export const IDEMPOTENCY_HEADER = 'Idempotency-Key'
export const IDEMPOTENT_REPLAY_HEADER = 'Idempotent-Replayed'

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/

/**
 * Handler tạo chứng từ. `transaction` có giá trị khi request mang Idempotency-Key: mọi thao tác
 * ghi PHẢI chạy trên transaction này để chứng từ và phản hồi lưu lại được commit cùng nhau.
 */
export type IdempotentHandler = (
  c: Context,
  transaction: ServiceTransaction | undefined,
) => Promise<Response>

/** Phản hồi lỗi do handler tự trả (không ném): rollback nhưng vẫn gửi nguyên cho máy khách. */
class DiscardedResponse {
  constructor(readonly response: Response) {}
}

/**
 * POS-02, TIEN-04, KHO-08 (R4): chống tạo chứng từ đôi khi máy khách gửi lại sau lúc mất phản hồi.
 *
 * - Khóa là duy nhất theo cửa hàng. Dòng khóa được giành ngay đầu transaction; request thứ hai
 *   cùng khóa chạy song song bị Postgres giữ ở câu INSERT cho tới khi request đầu kết thúc.
 * - Phản hồi thành công được ghi trong CÙNG transaction với chứng từ. Gửi lại cùng khóa nhận
 *   nguyên phản hồi cũ (kèm header `Idempotent-Replayed: true`), máy khách đi tiếp như lần đầu.
 * - Cùng khóa nhưng khác nội dung (hoặc khác người gửi, khác đường dẫn) thì 422.
 * - Lỗi thì rollback cả khóa, lần gửi sau được xử lý lại như mới.
 *
 * Request không có header chạy như cũ (script, bản web cũ); đơn ngoại tuyến chống trùng bằng
 * `clientId` ở `/sync/push`.
 */
export function idempotent(db: Db, handler: IdempotentHandler) {
  return async (c: Context): Promise<Response> => {
    const key = c.req.header(IDEMPOTENCY_HEADER)
    if (key === undefined) return handler(c, undefined)
    if (!KEY_PATTERN.test(key)) {
      throw new ApiError('VALIDATION_ERROR', 'Idempotency-Key không hợp lệ')
    }

    const auth = c.get('auth')
    const requestPath = c.req.path
    const requestHash = await hashRequest(c, auth.userId)
    const scope = and(eq(idempotencyKeys.storeId, auth.storeId), eq(idempotencyKeys.key, key))

    try {
      return await db.transaction(async (tx) => {
        const claimed = await tx
          .insert(idempotencyKeys)
          .values({ storeId: auth.storeId, key, userId: auth.userId, requestPath, requestHash })
          .onConflictDoNothing()
          .returning({ key: idempotencyKeys.key })

        if (claimed.length === 0) {
          const [previous] = await tx.select().from(idempotencyKeys).where(scope).limit(1)
          if (!previous || previous.responseStatus === null) {
            throw new ApiError('CONFLICT', 'Yêu cầu này đang được xử lý, vui lòng thử lại sau')
          }
          return replay(c, previous, requestHash)
        }

        const response = await handler(c, tx)
        if (!response.ok) throw new DiscardedResponse(response)
        const responseBody: unknown = await response.clone().json()
        await tx
          .update(idempotencyKeys)
          .set({ responseStatus: response.status, responseBody })
          .where(scope)
        return response
      })
    } catch (err) {
      if (err instanceof DiscardedResponse) return err.response
      throw err
    }
  }
}

type IdempotencyRow = typeof idempotencyKeys.$inferSelect

/** Trả nguyên phản hồi đã lưu của khóa; cùng khóa khác nội dung thì 422 */
function replay(c: Context, previous: IdempotencyRow, requestHash: string): Response {
  if (previous.requestHash !== requestHash) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      'Idempotency-Key đã dùng cho một yêu cầu khác. Vui lòng tải lại trang rồi thao tác lại',
      { reason: 'idempotency_key_reused' },
    )
  }
  c.header(IDEMPOTENT_REPLAY_HEADER, 'true')
  return c.json(previous.responseBody, previous.responseStatus as ContentfulStatusCode)
}

/**
 * Như `idempotent()`, thêm bước `preflight` chạy trên kết nối gốc NGOÀI transaction, ví dụ kiểm PIN
 * người duyệt để lần nhập sai được đếm dù request rollback. Khóa đã có phản hồi hoàn tất thì trả
 * phản hồi cũ TRƯỚC, không chạy preflight: gửi lại sau khi chứng từ đã tạo không kiểm PIN lại (PIN
 * có thể đã đổi hoặc bị khóa) và không ghi thêm lượt duyệt.
 */
export function idempotentWithPreflight<T>(
  db: Db,
  preflight: (c: Context) => Promise<T>,
  handler: (c: Context, transaction: ServiceTransaction | undefined, pre: T) => Promise<Response>,
) {
  return async (c: Context): Promise<Response> => {
    const key = c.req.header(IDEMPOTENCY_HEADER)
    if (key !== undefined && KEY_PATTERN.test(key)) {
      const auth = c.get('auth')
      const [previous] = await db
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.storeId, auth.storeId), eq(idempotencyKeys.key, key)))
        .limit(1)
      if (previous && previous.responseStatus !== null) {
        return replay(c, previous, await hashRequest(c, auth.userId))
      }
    }
    const pre = await preflight(c)
    return idempotent(db, (ctx, transaction) => handler(ctx, transaction, pre))(c)
  }
}

async function hashRequest(c: Context, userId: string): Promise<string> {
  const text = await c.req.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // Body không phải JSON: băm nguyên văn, handler sẽ tự trả lỗi 400
  }
  return createHash('sha256')
    .update(canonicalJson({ method: c.req.method, path: c.req.path, userId, body }))
    .digest('hex')
}

/** JSON với khóa object sắp theo thứ tự, để cùng nội dung luôn ra cùng một chuỗi. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
