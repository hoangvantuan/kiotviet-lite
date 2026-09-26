import { and, eq } from 'drizzle-orm'

import {
  isQuantityAllowed,
  isWholeQuantity,
  products,
  productUnitConversions,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from './errors.js'

/**
 * Cờ số lượng lẻ của mặt hàng (ADR-0015 mục 2): số lượng theo đơn vị đã chọn theo cờ của đơn vị
 * đó (đơn vị gốc theo cờ sản phẩm), và số quy ra đơn vị gốc phải nguyên khi sản phẩm không bật cờ.
 * Vi phạm trả 400 kèm tên hàng.
 */
export function assertQuantityAllowed(args: {
  quantity: number
  productName: string
  productAllowsDecimal: boolean
  /** Có khi dòng dùng đơn vị quy đổi */
  unitConversion?: { conversionFactor: number; allowDecimalQuantity: boolean } | null
  /** Dòng gốc đã có số lẻ (trả hàng, trả hàng nhập): cho trả lẻ dù cờ đã tắt sau đó */
  originalQuantity?: number
  itemIndex?: number
}): void {
  const { quantity, productName, productAllowsDecimal, unitConversion } = args
  if (args.originalQuantity !== undefined && !isWholeQuantity(args.originalQuantity)) return
  if (!isQuantityAllowed({ quantity, productAllowsDecimal, unitConversion })) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `${productName} chỉ nhận số lượng nguyên (mặt hàng chưa bật bán số lẻ)`,
      {
        reason: 'decimal_quantity_not_allowed',
        ...(args.itemIndex !== undefined ? { itemIndex: args.itemIndex } : {}),
        quantity,
      },
    )
  }
}

/**
 * Như assertQuantityAllowed nhưng tự đọc cờ của mặt hàng và đơn vị quy đổi. Dùng ở chứng từ không
 * nạp sẵn sản phẩm (trả hàng, trả hàng nhập).
 */
export async function assertStoredQuantityAllowed(args: {
  db: Db
  storeId: string
  productId: string
  unitConversionId?: string | null
  /** Hệ số chụp trên chứng từ gốc: dùng khi không còn (hoặc không lưu) đơn vị quy đổi */
  conversionFactor?: number
  quantity: number
  /** Mặc định tên hiện tại của sản phẩm */
  productName?: string
  originalQuantity?: number
  itemIndex?: number
}): Promise<void> {
  if (isWholeQuantity(args.quantity)) return
  const [product] = await args.db
    .select({ name: products.name, allowDecimalQuantity: products.allowDecimalQuantity })
    .from(products)
    .where(and(eq(products.id, args.productId), eq(products.storeId, args.storeId)))
    .limit(1)
  let unitConversion: { conversionFactor: number; allowDecimalQuantity: boolean } | null = null
  if (args.unitConversionId) {
    const [conv] = await args.db
      .select({
        conversionFactor: productUnitConversions.conversionFactor,
        allowDecimalQuantity: productUnitConversions.allowDecimalQuantity,
      })
      .from(productUnitConversions)
      .where(eq(productUnitConversions.id, args.unitConversionId))
      .limit(1)
    if (conv) unitConversion = { ...conv, conversionFactor: Number(conv.conversionFactor) }
  }
  const productAllowsDecimal = product?.allowDecimalQuantity ?? false
  // Không rõ cờ của đơn vị: theo cờ sản phẩm (chặt nhất)
  if (!unitConversion && args.conversionFactor !== undefined && args.conversionFactor > 1) {
    unitConversion = {
      conversionFactor: args.conversionFactor,
      allowDecimalQuantity: productAllowsDecimal,
    }
  }
  assertQuantityAllowed({
    quantity: args.quantity,
    productName: args.productName ?? product?.name ?? 'Sản phẩm',
    productAllowsDecimal,
    unitConversion,
    ...(args.originalQuantity !== undefined ? { originalQuantity: args.originalQuantity } : {}),
    ...(args.itemIndex !== undefined ? { itemIndex: args.itemIndex } : {}),
  })
}

/**
 * Bất biến I10 (ADR-0015 mục 2): mặt hàng không bật cờ thì tồn luôn nguyên. Dòng gốc lẻ được trả
 * hoặc hủy lẻ dù cờ đã tắt sau đó, nhưng nếu phép đó làm tồn sản phẩm hoặc biến thể thành số lẻ
 * thì chặn 422: người dùng bật lại cờ rồi mới trả, hủy phần lẻ. Gọi trong transaction, sau khi tính
 * tồn mới, để lỗi thì rollback cả chứng từ.
 */
export function assertStockStaysWhole(args: {
  stock: number
  productName: string
  productAllowsDecimal: boolean
}): void {
  if (args.productAllowsDecimal || isWholeQuantity(args.stock)) return
  throw new ApiError(
    'BUSINESS_RULE_VIOLATION',
    `${args.productName}: Bật lại cho phép số lượng lẻ cho mặt hàng này để trả/hủy phần lẻ`,
    { reason: 'decimal_stock_not_allowed', stock: args.stock },
  )
}
