import type { Context } from 'hono'

import { type CancelDocumentInput, cancelDocumentSchema } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { parseJson } from '../lib/http.js'
import { getRequestMeta } from '../services/audit.service.js'
import {
  authorizeDocumentCancel,
  type PreauthorizedCancel,
} from '../services/document-cancel.helper.js'
import type { ServiceTransaction } from '../services/service-transaction.js'
import { idempotentWithPreflight } from './idempotency.js'

export interface CancelDocumentHandlerArgs {
  transaction: ServiceTransaction | undefined
  input: CancelDocumentInput
  preauthorized: PreauthorizedCancel
}

/**
 * TIEN-107: route hủy chứng từ. Kiểm quyền và PIN người duyệt trên kết nối gốc TRƯỚC khi vào
 * transaction của `idempotent()`, để số lần nhập sai PIN được ghi lại (và khóa PIN) dù lệnh hủy
 * không thành. Kiểm trong transaction thì lần sai bị rollback cùng request, dò PIN được mãi.
 * Gửi lại cùng Idempotency-Key sau khi đã hủy xong nhận phản hồi cũ, không kiểm PIN lại.
 */
export function cancelDocumentRoute(
  db: Db,
  handler: (c: Context, args: CancelDocumentHandlerArgs) => Promise<Response>,
) {
  return async (c: Context): Promise<Response> => {
    const input = await parseJson(c, cancelDocumentSchema)
    return idempotentWithPreflight(
      db,
      (ctx) =>
        authorizeDocumentCancel({
          db,
          actor: ctx.get('auth'),
          input,
          meta: getRequestMeta(ctx),
        }),
      (ctx, transaction, approver) =>
        handler(ctx, { transaction, input, preauthorized: { approver } }),
    )(c)
  }
}
