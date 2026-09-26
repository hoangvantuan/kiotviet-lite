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
import { idempotent } from './idempotency.js'

export interface CancelDocumentHandlerArgs {
  transaction: ServiceTransaction | undefined
  input: CancelDocumentInput
  preauthorized: PreauthorizedCancel
}

/**
 * TIEN-107: route hủy chứng từ. Kiểm quyền và PIN người duyệt trên kết nối gốc TRƯỚC khi vào
 * transaction của `idempotent()`, để số lần nhập sai PIN được ghi lại (và khóa PIN) dù lệnh hủy
 * không thành. Kiểm trong transaction thì lần sai bị rollback cùng request, dò PIN được mãi.
 */
export function cancelDocumentRoute(
  db: Db,
  handler: (c: Context, args: CancelDocumentHandlerArgs) => Promise<Response>,
) {
  return async (c: Context): Promise<Response> => {
    const input = await parseJson(c, cancelDocumentSchema)
    const approver = await authorizeDocumentCancel({
      db,
      actor: c.get('auth'),
      input,
      meta: getRequestMeta(c),
    })
    return idempotent(db, (ctx, transaction) =>
      handler(ctx, { transaction, input, preauthorized: { approver } }),
    )(c)
  }
}
