/**
 * Test factories — hàm trợ giúp tạo dữ liệu mẫu cho integration test.
 *
 * Mỗi factory nhận `TestEnv` (từ `createTestEnv()`) và `overrides` tùy chọn,
 * trả về record đã insert vào PGlite. Bộ đếm nội bộ đảm bảo giá trị
 * unique (phone, sku, orderNumber…) không trùng giữa các lần gọi.
 */
import { eq } from 'drizzle-orm'

import {
  customers,
  debts,
  orderItems,
  orderReturnItems,
  orderReturns,
  orders,
  products,
  productUnitConversions,
  productVariants,
  stores,
  users,
} from '@kiotviet-lite/shared'

import { signAccessToken } from '../../lib/jwt.js'
import { hashPassword } from '../../lib/password.js'
import type { SeededUser, TestEnv } from './test-env.js'

// ---------------------------------------------------------------------------
// Bộ đếm nội bộ — tránh trùng phone/sku/orderNumber giữa các lần gọi
// ---------------------------------------------------------------------------
let seq = 0
function nextSeq(): number {
  return ++seq
}

/** Reset bộ đếm — gọi trong beforeEach nếu muốn id dễ đoán */
export function resetFactorySeq(): void {
  seq = 0
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
export type StoreOverrides = Partial<typeof stores.$inferInsert>

export async function createStore(env: TestEnv, overrides: StoreOverrides = {}) {
  const n = nextSeq()
  const [store] = await env.db
    .insert(stores)
    .values({
      name: `Cửa hàng factory ${n}`,
      ...overrides,
    })
    .returning()
  if (!store) throw new Error('createStore failed')
  return store
}

// ---------------------------------------------------------------------------
// User (với accessToken sẵn)
// ---------------------------------------------------------------------------
export interface UserOverrides {
  storeId?: string
  name?: string
  phone?: string
  role?: 'owner' | 'manager' | 'staff'
  pin?: string
  password?: string
  isActive?: boolean
}

export interface FactoryUser extends SeededUser {
  name: string
}

export async function createUser(
  env: TestEnv,
  overrides: UserOverrides = {},
): Promise<FactoryUser> {
  const n = nextSeq()
  const storeId = overrides.storeId ?? env.storeId
  const role = overrides.role ?? 'staff'
  const phone = overrides.phone ?? `098${String(n).padStart(7, '0')}`
  const pin = overrides.pin ?? '000000'
  const password = overrides.password ?? 'matkhau123'
  const name = overrides.name ?? `User factory ${n}`

  const passwordHash = await hashPassword(password)
  const pinHash = await hashPassword(pin)

  const [row] = await env.db
    .insert(users)
    .values({
      storeId,
      name,
      phone,
      passwordHash,
      pinHash,
      role,
      isActive: overrides.isActive ?? true,
    })
    .returning()
  if (!row) throw new Error('createUser failed')

  const accessToken = signAccessToken({
    userId: row.id,
    storeId: row.storeId,
    role: row.role,
  })

  return {
    id: row.id,
    storeId: row.storeId,
    role: row.role,
    phone: row.phone ?? '',
    pin,
    name,
    accessToken,
    authHeader: { Authorization: `Bearer ${accessToken}` },
  }
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------
export type CustomerOverrides = Partial<typeof customers.$inferInsert>

export async function createCustomer(env: TestEnv, overrides: CustomerOverrides = {}) {
  const n = nextSeq()
  const [row] = await env.db
    .insert(customers)
    .values({
      storeId: overrides.storeId ?? env.storeId,
      name: `KH factory ${n}`,
      phone: `097${String(n).padStart(7, '0')}`,
      currentDebt: 0,
      ...overrides,
    })
    .returning()
  if (!row) throw new Error('createCustomer failed')
  return row
}

// ---------------------------------------------------------------------------
// Product (đơn giản, không biến thể)
// ---------------------------------------------------------------------------
export interface ProductOverrides extends Partial<typeof products.$inferInsert> {
  /** Nếu true, sẽ đặt hasVariants = true (mặc định false) */
  withVariants?: boolean
}

export async function createProduct(env: TestEnv, overrides: ProductOverrides = {}) {
  const n = nextSeq()
  const { withVariants, ...rest } = overrides
  const [row] = await env.db
    .insert(products)
    .values({
      storeId: env.storeId,
      name: `SP factory ${n}`,
      sku: `SKU-F${n}`,
      unit: 'cái',
      sellingPrice: 100_000,
      costPrice: 50_000,
      currentStock: 100,
      minStock: 5,
      trackInventory: true,
      hasVariants: withVariants ?? false,
      ...rest,
    })
    .returning()
  if (!row) throw new Error('createProduct failed')
  return row
}

// ---------------------------------------------------------------------------
// Product variant
// ---------------------------------------------------------------------------
export interface VariantOverrides extends Partial<typeof productVariants.$inferInsert> {
  attribute1Name?: string
  attribute1Value?: string
  attribute2Name?: string
  attribute2Value?: string
}

export async function createVariant(
  env: TestEnv,
  productId: string,
  overrides: VariantOverrides = {},
) {
  const n = nextSeq()
  const [row] = await env.db
    .insert(productVariants)
    .values({
      storeId: env.storeId,
      productId,
      sku: `SKU-V${n}`,
      attribute1Name: overrides.attribute1Name ?? 'Màu',
      attribute1Value: overrides.attribute1Value ?? `Màu ${n}`,
      sellingPrice: 120_000,
      costPrice: 60_000,
      stockQuantity: 50,
      ...overrides,
    })
    .returning()
  if (!row) throw new Error('createVariant failed')
  return row
}

// ---------------------------------------------------------------------------
// Product unit conversion (đơn vị quy đổi)
// ---------------------------------------------------------------------------
export type UnitConversionOverrides = Partial<typeof productUnitConversions.$inferInsert>

export async function createUnitConversion(
  env: TestEnv,
  productId: string,
  overrides: UnitConversionOverrides = {},
) {
  const n = nextSeq()
  const [row] = await env.db
    .insert(productUnitConversions)
    .values({
      storeId: env.storeId,
      productId,
      unit: `thùng-${n}`,
      conversionFactor: 12,
      sellingPrice: 1_200_000,
      ...overrides,
    })
    .returning()
  if (!row) throw new Error('createUnitConversion failed')
  return row
}

// ---------------------------------------------------------------------------
// Completed order (đơn hàng hoàn tất, đã thanh toán tiền mặt)
// ---------------------------------------------------------------------------
export interface CompletedOrderOverrides {
  customerId?: string | null
  /** Danh sách sản phẩm. Mặc định: 1 sản phẩm, qty=1, unitPrice=100_000 */
  items?: Array<{
    productId: string
    productName?: string
    unit?: string
    unitPrice?: number
    quantity?: number
    variantId?: string | null
    variantName?: string | null
    discountAmount?: number
  }>
  /** Override trường trên bảng orders */
  orderOverrides?: Partial<typeof orders.$inferInsert>
}

export interface CompletedOrderResult {
  order: typeof orders.$inferSelect
  items: Array<typeof orderItems.$inferSelect>
}

export async function createCompletedOrder(
  env: TestEnv,
  productId: string,
  overrides: CompletedOrderOverrides = {},
): Promise<CompletedOrderResult> {
  const n = nextSeq()

  const rawItems = overrides.items ?? [
    {
      productId,
      productName: 'SP factory',
      unit: 'cái',
      unitPrice: 100_000,
      quantity: 1,
    },
  ]

  const subtotal = rawItems.reduce(
    (sum, i) => sum + (i.unitPrice ?? 100_000) * (i.quantity ?? 1) - (i.discountAmount ?? 0),
    0,
  )

  const [order] = await env.db
    .insert(orders)
    .values({
      storeId: env.storeId,
      orderNumber: `HD-F${String(n).padStart(4, '0')}`,
      customerId: overrides.customerId ?? null,
      userId: env.owner.id,
      subtotal,
      discountAmount: 0,
      total: subtotal,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      cashAmount: subtotal,
      change: 0,
      status: 'completed',
      ...overrides.orderOverrides,
    })
    .returning()
  if (!order) throw new Error('createCompletedOrder: insert order failed')

  const insertedItems = await env.db
    .insert(orderItems)
    .values(
      rawItems.map((i) => ({
        orderId: order.id,
        productId: i.productId,
        productName: i.productName ?? 'SP factory',
        unit: i.unit ?? 'cái',
        unitPrice: i.unitPrice ?? 100_000,
        quantity: i.quantity ?? 1,
        variantId: i.variantId ?? null,
        variantName: i.variantName ?? null,
        discountAmount: i.discountAmount ?? 0,
        lineTotal: (i.unitPrice ?? 100_000) * (i.quantity ?? 1) - (i.discountAmount ?? 0),
      })),
    )
    .returning()

  return { order, items: insertedItems }
}

// ---------------------------------------------------------------------------
// Debt order (đơn hàng ghi nợ) — trả về cả debt record
// ---------------------------------------------------------------------------
export interface DebtOrderResult extends CompletedOrderResult {
  debt: typeof debts.$inferSelect
  customer: typeof customers.$inferSelect
}

export async function createDebtOrder(
  env: TestEnv,
  productId: string,
  customerId: string,
  overrides: Omit<CompletedOrderOverrides, 'customerId'> = {},
): Promise<DebtOrderResult> {
  const { order, items } = await createCompletedOrder(env, productId, {
    ...overrides,
    customerId,
    orderOverrides: {
      paymentMethod: 'debt',
      paymentStatus: 'unpaid',
      cashAmount: 0,
      ...overrides.orderOverrides,
    },
  })

  const [debt] = await env.db
    .insert(debts)
    .values({
      storeId: env.storeId,
      orderId: order.id,
      customerId,
      amount: order.total,
      paid: 0,
      remaining: order.total,
    })
    .returning()
  if (!debt) throw new Error('createDebtOrder: insert debt failed')

  // Cập nhật currentDebt trên customer
  const [customer] = await env.db
    .update(customers)
    .set({
      currentDebt:
        (await env.db.query.customers.findFirst({
          where: eq(customers.id, customerId),
          columns: { currentDebt: true },
        }))!.currentDebt + order.total,
    })
    .where(eq(customers.id, customerId))
    .returning()

  return { order, items, debt, customer: customer! }
}

// ---------------------------------------------------------------------------
// Partial return (đơn trả hàng một phần) — tạo order + return
// ---------------------------------------------------------------------------
export interface PartialReturnOverrides {
  /** Số lượng trả cho mỗi item (mặc định: 1) */
  returnQuantity?: number
  /** Lý do trả hàng */
  reason?: string
  /** Trả bằng tiền mặt (refundAmount) hay giảm nợ (debtReductionAmount)? Mặc định: cash */
  refundMethod?: 'cash' | 'debt'
}

export interface PartialReturnResult {
  order: typeof orders.$inferSelect
  orderItems: Array<typeof orderItems.$inferSelect>
  orderReturn: typeof orderReturns.$inferSelect
  returnItems: Array<typeof orderReturnItems.$inferSelect>
}

export async function createPartialReturn(
  env: TestEnv,
  productId: string,
  customerId: string | null,
  overrides: PartialReturnOverrides = {},
): Promise<PartialReturnResult> {
  const n = nextSeq()
  const returnQty = overrides.returnQuantity ?? 1
  const reason = overrides.reason ?? 'defective'

  // Tạo đơn gốc (2 sản phẩm, qty=3 mỗi loại)
  const { order, items } = await createCompletedOrder(env, productId, {
    customerId,
    items: [
      {
        productId,
        productName: 'SP factory',
        unitPrice: 100_000,
        quantity: 3,
      },
    ],
  })

  // Cập nhật status đơn sang partial_return
  const [updatedOrder] = await env.db
    .update(orders)
    .set({ status: 'partial_return' })
    .where(eq(orders.id, order.id))
    .returning()

  const totalReturnAmount = returnQty * 100_000
  const refundAmount = overrides.refundMethod === 'debt' ? 0 : totalReturnAmount
  const debtReduction = overrides.refundMethod === 'debt' ? totalReturnAmount : 0

  const [orderReturn] = await env.db
    .insert(orderReturns)
    .values({
      storeId: env.storeId,
      orderId: order.id,
      returnNumber: `TH-F${String(n).padStart(4, '0')}`,
      totalAmount: totalReturnAmount,
      refundAmount,
      debtReductionAmount: debtReduction,
      createdBy: env.owner.id,
    })
    .returning()
  if (!orderReturn) throw new Error('createPartialReturn: insert return failed')

  const returnItemValues = items.map((item) => ({
    returnId: orderReturn.id,
    orderItemId: item.id,
    productId: item.productId,
    variantId: item.variantId ?? null,
    productName: item.productName,
    variantName: item.variantName ?? null,
    unit: item.unit ?? 'cái',
    unitPrice: item.unitPrice,
    quantity: returnQty,
    lineTotal: returnQty * item.unitPrice,
    reason,
  }))

  const insertedReturnItems = await env.db
    .insert(orderReturnItems)
    .values(returnItemValues)
    .returning()

  return {
    order: updatedOrder!,
    orderItems: items,
    orderReturn,
    returnItems: insertedReturnItems,
  }
}
