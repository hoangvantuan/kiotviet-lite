import { and, eq, inArray } from 'drizzle-orm'

import { customers, priceLists, products, productVariants, suppliers } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'

/**
 * Các thực thể thuộc cửa hàng mà payload ghi hay tham chiếu tới bằng ID.
 * Thông báo trùng với thông báo 404 của route đọc trực tiếp thực thể đó,
 * để ID của cửa hàng khác và ID không tồn tại trả về giống hệt nhau.
 */
const STORE_SCOPED = {
  customer: { table: customers, notFound: 'Không tìm thấy khách hàng' },
  supplier: { table: suppliers, notFound: 'Không tìm thấy nhà cung cấp' },
  product: { table: products, notFound: 'Không tìm thấy sản phẩm' },
  variant: { table: productVariants, notFound: 'Không tìm thấy biến thể' },
  priceList: { table: priceLists, notFound: 'Không tìm thấy bảng giá' },
} as const

export type StoreScopedKind = keyof typeof STORE_SCOPED

export type StoreScopedRefs = Partial<
  Record<StoreScopedKind, ReadonlyArray<string | null | undefined> | string | null | undefined>
>

/**
 * Kiểm MỌI khóa ngoại do client gửi thuộc đúng cửa hàng của actor (BM-02).
 *
 * Máy chủ không tin ID trong payload: ID của cửa hàng khác hay ID không tồn tại đều trả
 * 404 như khi đọc thẳng thực thể, thay vì lưu nguyên hoặc lộ lỗi khóa ngoại thành 500.
 * Chỉ kiểm quyền sở hữu; điều kiện nghiệp vụ (đã xóa mềm, ngừng hoạt động...) do nơi gọi quyết.
 * Giá trị null/undefined bỏ qua để dùng thẳng với trường tùy chọn.
 */
export async function assertStoreOwned(
  db: Db,
  storeId: string,
  refs: StoreScopedRefs,
): Promise<void> {
  for (const kind of Object.keys(refs) as StoreScopedKind[]) {
    const raw = refs[kind]
    const list = Array.isArray(raw) ? raw : [raw]
    const ids = [...new Set(list.filter((id): id is string => typeof id === 'string'))]
    if (ids.length === 0) continue

    const { table, notFound } = STORE_SCOPED[kind]
    const rows = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.storeId, storeId), inArray(table.id, ids)))
    if (rows.length !== ids.length) {
      throw new ApiError('NOT_FOUND', notFound)
    }
  }
}
