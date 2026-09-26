import { and, eq, inArray } from 'drizzle-orm'

import {
  calculateLineDiscount,
  calculateOrderDiscount,
  type CreateOrderInput,
  hasPermission,
  type OrderPaymentStatus,
  type OrderPolicyViolation,
  type Permission,
  type PriceSource,
  products,
  productUnitConversions,
  productVariants,
  SYNC_SOLD_AT_MAX_AGE_DAYS,
  SYNC_SOLD_AT_MAX_FUTURE_MS,
  type UserRole,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { getStoreTimezone } from '../lib/timezone.js'
import {
  type ApprovalRequester,
  assertApprovalAllowed,
  recordApprovalFailure,
  recordApprovalSuccess,
} from './approval-guard.js'
import type { RequestMeta } from './audit.service.js'
import { verifyPin } from './pin.service.js'

/**
 * Lớp chính sách đơn hàng (R1): máy chủ không tin số liệu và quyền do máy khách gửi.
 * Tính lại chiết khấu và trạng thái thanh toán từ dữ liệu máy chủ, xác định thao tác nào vượt
 * quyền người bán và kiểm PIN của NGƯỜI DUYỆT giữ quyền đó, không phải PIN của người bán.
 */

export interface PolicyActor {
  userId: string
  storeId: string
  role: UserRole
  /**
   * OFF-05: người đồng bộ đơn ngoại tuyến khi khác người bán. `sellerUserId` do máy khách gửi, nên
   * quyền dùng để tự duyệt là giao quyền của người bán và người đồng bộ: nhân viên không mượn được
   * quyền của chủ bằng cách khai chủ là người bán, và chủ đồng bộ hộ không nâng quyền cho đơn của
   * nhân viên.
   */
  syncedBy?: { userId: string; role: UserRole } | null
}

/** Quyền thực của actor khi đánh giá chính sách, xem PolicyActor.syncedBy. */
export function actorHasPermission(actor: PolicyActor, permission: Permission): boolean {
  if (!hasPermission(actor.role, permission)) return false
  return !actor.syncedBy || hasPermission(actor.syncedBy.role, permission)
}

export interface Approver {
  userId: string
  role: UserRole
  name: string
}

export type ApprovalPermission =
  | 'pos.editPrice'
  | 'pos.editPriceBelowCost'
  | 'pos.overrideDebtLimit'
  | 'documents.cancel'
  | 'orders.returnOverride'

export const APPROVAL_PERMISSIONS: readonly ApprovalPermission[] = [
  'pos.editPrice',
  'pos.editPriceBelowCost',
  'pos.overrideDebtLimit',
  'documents.cancel',
  'orders.returnOverride',
]

const PERMISSION_LABELS: Record<ApprovalPermission, string> = {
  'pos.editPrice': 'sửa giá, chiết khấu',
  'pos.editPriceBelowCost': 'bán dưới giá vốn',
  'pos.overrideDebtLimit': 'duyệt vượt hạn mức nợ',
  'documents.cancel': 'hủy chứng từ',
  'orders.returnOverride': 'hoàn tiền trả hàng qua kênh khác',
}

// ---------------------------------------------------------------------------
// Người duyệt
// ---------------------------------------------------------------------------

export interface VerifyApprovalDeps {
  db: Db
  storeId: string
  approverUserId: string
  pin: string
  /** Quyền kiểm TRƯỚC khi kiểm PIN */
  permissions: readonly ApprovalPermission[]
  /**
   * Quyền chỉ kiểm SAU khi PIN đúng. Dùng cho pos.editPriceBelowCost khi người bán không được xem
   * giá vốn: báo thiếu quyền này trước khi có PIN đúng là lộ ra dòng đang dưới giá vốn.
   */
  permissionsAfterPin?: readonly ApprovalPermission[]
  /** Người đang nhập PIN; khác người duyệt thì áp bộ chặn dò PIN (approval-guard.ts) */
  requester?: ApprovalRequester
  /** false: PIN sai không cộng số lần sai (đơn ngoại tuyến đồng bộ lại) */
  recordFailure?: boolean
  meta?: RequestMeta
}

function assertHasPermissions(
  approver: { role: UserRole; name: string },
  permissions: readonly ApprovalPermission[],
) {
  const missing = permissions.filter((perm) => !hasPermission(approver.role, perm))
  if (missing.length === 0) return
  const labels = missing.map((perm) => PERMISSION_LABELS[perm]).join(', ')
  throw new ApiError(
    'FORBIDDEN',
    `${approver.name} không có quyền ${labels}. Cần mã PIN của người có quyền này duyệt`,
    { missingPermissions: missing },
  )
}

/**
 * Người duyệt phải thuộc cùng cửa hàng và giữ ĐỦ các quyền cần duyệt; sau đó mới kiểm PIN của
 * chính người đó (khóa PIN sau 5 lần sai như `/verify-pin`). Kiểm quyền trước PIN để không ai dò
 * PIN của người vốn không duyệt được. Nhập PIN của người khác thì còn qua bộ chặn dò PIN theo
 * người bán và IP.
 */
export async function verifyApproval({
  db,
  storeId,
  approverUserId,
  pin,
  permissions,
  permissionsAfterPin = [],
  requester,
  recordFailure = true,
  meta,
}: VerifyApprovalDeps): Promise<Approver> {
  const [approver] = await db
    .select({ id: users.id, role: users.role, name: users.name })
    .from(users)
    .where(and(eq(users.id, approverUserId), eq(users.storeId, storeId)))
    .limit(1)
  if (!approver) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy người duyệt')
  }

  assertHasPermissions(approver, permissions)

  const guarded = recordFailure && requester !== undefined && requester.userId !== approver.id
  if (guarded) assertApprovalAllowed(requester)
  try {
    await verifyPin({ db, userId: approver.id, storeId, pin, meta, recordFailure })
  } catch (err) {
    if (guarded && err instanceof ApiError && err.code === 'UNAUTHORIZED') {
      recordApprovalFailure(requester)
    }
    throw err
  }
  if (guarded) recordApprovalSuccess(requester)

  assertHasPermissions(approver, permissionsAfterPin)
  return { userId: approver.id, role: approver.role, name: approver.name }
}

// ---------------------------------------------------------------------------
// Thanh toán (POS-15)
// ---------------------------------------------------------------------------

export interface DerivedPayment {
  paymentStatus: OrderPaymentStatus
  change: number
  debtAmount: number
}

type PaymentInput = Pick<
  CreateOrderInput,
  'total' | 'paymentMethod' | 'cashAmount' | 'transferAmount' | 'debtAmount'
>

/**
 * Máy chủ tự tính trạng thái thanh toán và tiền thừa. Đơn ghi nợ: tiền thu cộng nợ phải đúng
 * bằng tổng đơn, không có tiền thừa. Phương thức khác đã thu đủ tiền nên không được kèm nợ.
 * Tổ hợp mâu thuẫn bị từ chối 422 thay vì ghi một khoản nợ không có thật.
 */
export function derivePayment(input: PaymentInput): DerivedPayment {
  const total = input.total
  const debtAmount = input.debtAmount ?? 0
  const cash = input.cashAmount ?? 0
  const transfer = input.transferAmount ?? 0

  if (input.paymentMethod === 'debt') {
    if (cash + transfer + debtAmount !== total) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Tiền đã thu cộng số ghi nợ phải bằng tổng thanh toán',
        { total, cashAmount: cash, transferAmount: transfer, debtAmount },
      )
    }
    return {
      paymentStatus: debtAmount === total ? 'unpaid' : 'partial',
      change: 0,
      debtAmount,
    }
  }

  if (debtAmount > 0) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      'Đơn đã thu đủ tiền nên không được ghi nợ. Chọn phương thức ghi nợ nếu khách còn nợ',
      { paymentMethod: input.paymentMethod, total, debtAmount },
    )
  }

  let change = 0
  if (input.paymentMethod === 'cash') change = cash - total
  else if (input.paymentMethod === 'combined') change = cash + transfer - total
  return { paymentStatus: 'paid', change: Math.max(0, change), debtAmount: 0 }
}

// ---------------------------------------------------------------------------
// Chiết khấu (POS-01)
// ---------------------------------------------------------------------------

/**
 * Số tiền chiết khấu dòng và đơn phải đúng bằng số tính lại từ loại và giá trị chiết khấu, để
 * không gửi được "giảm 450.000đ" kèm loại chiết khấu rỗng. Áp cho cả đơn ngoại tuyến: giao diện
 * tính chiết khấu bằng cùng hàm dùng chung nên số lệch chỉ đến từ payload bị sửa (ADR-0009).
 */
export function assertDiscountAmounts(input: CreateOrderInput): void {
  for (const item of input.items) {
    const expected = calculateLineDiscount({
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      discountType: item.discountType,
      discountValue: item.discountValue,
    })
    if (item.discountAmount !== expected) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Chiết khấu dòng không khớp với loại và giá trị chiết khấu',
        {
          productId: item.productId,
          clientDiscount: item.discountAmount,
          serverDiscount: expected,
        },
      )
    }
  }

  const expectedOrder = calculateOrderDiscount({
    subtotal: input.subtotal,
    discountType: input.discountType,
    discountValue: input.discountValue,
  })
  if (input.discountAmount !== expectedOrder) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Chiết khấu đơn không khớp với loại và giá trị chiết khấu',
      { clientDiscount: input.discountAmount, serverDiscount: expectedOrder },
    )
  }
}

// ---------------------------------------------------------------------------
// Giá vốn từng dòng
// ---------------------------------------------------------------------------

/**
 * Giá vốn của MỘT đơn vị bán trên từng dòng: giá vốn biến thể, không có thì giá vốn sản phẩm
 * (ADR-0007), nhân hệ số quy đổi nếu bán theo đơn vị quy đổi. null khi chưa có giá vốn.
 */
export async function loadLineUnitCosts(
  db: Db,
  storeId: string,
  items: CreateOrderInput['items'],
): Promise<Array<number | null>> {
  const productIds = [...new Set(items.map((i) => i.productId))]
  const variantIds = [...new Set(items.flatMap((i) => (i.variantId ? [i.variantId] : [])))]
  const conversionIds = [
    ...new Set(items.flatMap((i) => (i.unitConversionId ? [i.unitConversionId] : []))),
  ]

  const [productRows, variantRows, conversionRows] = await Promise.all([
    db
      .select({ id: products.id, costPrice: products.costPrice })
      .from(products)
      .where(and(eq(products.storeId, storeId), inArray(products.id, productIds))),
    variantIds.length > 0
      ? db
          .select({ id: productVariants.id, costPrice: productVariants.costPrice })
          .from(productVariants)
          .where(and(eq(productVariants.storeId, storeId), inArray(productVariants.id, variantIds)))
      : Promise.resolve([]),
    conversionIds.length > 0
      ? db
          .select({
            id: productUnitConversions.id,
            conversionFactor: productUnitConversions.conversionFactor,
          })
          .from(productUnitConversions)
          .where(
            and(
              eq(productUnitConversions.storeId, storeId),
              inArray(productUnitConversions.id, conversionIds),
            ),
          )
      : Promise.resolve([]),
  ])

  const productCost = new Map(productRows.map((r) => [r.id, r.costPrice]))
  const variantCost = new Map(variantRows.map((r) => [r.id, r.costPrice]))
  const factor = new Map(conversionRows.map((r) => [r.id, r.conversionFactor]))

  return items.map((item) => {
    const raw =
      (item.variantId ? variantCost.get(item.variantId) : null) ??
      productCost.get(item.productId) ??
      null
    if (raw === null) return null
    const f = item.unitConversionId ? (factor.get(item.unitConversionId) ?? 1) : 1
    return Number(raw) * f
  })
}

// ---------------------------------------------------------------------------
// Duyệt giá (POS-01)
// ---------------------------------------------------------------------------

export interface PriceApproval {
  /** Có dòng sửa giá, chiết khấu dòng hay chiết khấu đơn */
  edited: boolean
  hasOverride: boolean
  hasDiscount: boolean
  /**
   * Dòng thành tiền thấp hơn giá vốn: dòng có sửa giá hoặc chiết khấu, và dòng lấy giá đặc biệt
   * (bảng giá, giá riêng khách, chiết khấu danh mục, giá theo số lượng) mà giá đó dưới giá vốn
   */
  belowCostLines: Set<number>
  /** Chiết khấu đơn kéo tổng đơn xuống dưới tổng giá vốn đã biết */
  orderBelowCost: boolean
  required: ApprovalPermission[]
  /** Đã được phép: người bán tự đủ quyền, hoặc người duyệt đủ quyền và PIN đúng */
  approved: boolean
  /** PIN đã được máy chủ kiểm đúng cho lần duyệt này */
  pinVerified: boolean
  approver: Approver | null
  /** Lý do chưa được duyệt (chỉ đơn ngoại tuyến đi tới đây mà không bị từ chối) */
  missingReason: string | null
}

export interface EvaluatePriceApprovalDeps {
  db: Db
  actor: PolicyActor
  input: CreateOrderInput
  source: 'pos' | 'offline_sync'
  unitCosts: Array<number | null>
  /** Nguồn giá máy chủ tính cho từng dòng; bỏ trống thì chỉ kiểm dòng có sửa giá, chiết khấu */
  lineSources?: Array<PriceSource | null>
  meta?: RequestMeta
}

/**
 * Sửa giá, chiết khấu dòng, chiết khấu đơn cần quyền `pos.editPrice`; nếu kéo thành tiền xuống
 * dưới giá vốn thì cần thêm `pos.editPriceBelowCost`. Người bán đủ quyền thì không cần ai duyệt,
 * riêng sửa giá luôn cần PIN (ADR-0002). Thiếu quyền thì cần `priceApproverId` cộng PIN của
 * người duyệt giữ đủ các quyền đó. Dòng không sửa giá mà giá đặc biệt đã dưới giá vốn (giá vốn biến
 * thể nếu có, POS-08) cũng cần `pos.editPriceBelowCost`.
 * Đơn POS vi phạm bị từ chối. Đơn ngoại tuyến đã bán xong tại quầy nên vẫn nhận, trả về
 * `approved = false` để nơi gọi ghi nhật ký và cảnh báo (ADR-0002, OFF-12).
 */
export async function evaluatePriceApproval({
  db,
  actor,
  input,
  source,
  unitCosts,
  lineSources,
  meta,
}: EvaluatePriceApprovalDeps): Promise<PriceApproval> {
  const hasOverride = input.items.some((i) => i.priceOverride)
  const hasLineDiscount = input.items.some((i) => i.discountAmount > 0)
  const hasOrderDiscount = input.discountAmount > 0
  const hasDiscount = hasLineDiscount || hasOrderDiscount
  const edited = hasOverride || hasDiscount

  const belowCostLines = new Set<number>()
  input.items.forEach((item, idx) => {
    const unitCost = unitCosts[idx]
    if (unitCost == null) return
    const source = lineSources?.[idx] ?? null
    const specialPrice = source !== null && source !== 'retail_price'
    if (!item.priceOverride && item.discountAmount <= 0 && !specialPrice) return
    if (item.lineTotal < unitCost * item.quantity) belowCostLines.add(idx)
  })
  // Dòng giá đặc biệt dưới giá vốn mà không có sửa giá hay chiết khấu nào vẫn phải duyệt
  const specialBelowCost = belowCostLines.size > 0 && !edited
  let orderBelowCost = false
  if (hasOrderDiscount) {
    const knownCost = input.items.reduce((sum, item, idx) => {
      const unitCost = unitCosts[idx]
      return unitCost == null ? sum : sum + unitCost * item.quantity
    }, 0)
    orderBelowCost = input.total < knownCost
  }

  const base = { edited, hasOverride, hasDiscount, belowCostLines, orderBelowCost }
  if (!edited && !specialBelowCost) {
    return {
      ...base,
      required: [],
      approved: true,
      pinVerified: false,
      approver: null,
      missingReason: null,
    }
  }

  const belowCost = belowCostLines.size > 0 || orderBelowCost
  const required: ApprovalPermission[] = edited ? ['pos.editPrice'] : []
  if (belowCost) required.push('pos.editPriceBelowCost')

  const sellerHasAll = required.every((perm) => actorHasPermission(actor, perm))
  if (sellerHasAll && !hasOverride) {
    return {
      ...base,
      required,
      approved: true,
      pinVerified: false,
      approver: null,
      missingReason: null,
    }
  }

  // Người bán không được xem giá vốn thì không được biết dòng nào dưới giá vốn trước khi có một
  // PIN đúng (BC-13): trước PIN chỉ nói tới pos.editPrice, pos.editPriceBelowCost kiểm sau PIN.
  const canViewCost = actorHasPermission(actor, 'products.viewCost')
  const beforePin: ApprovalPermission[] = canViewCost ? required : ['pos.editPrice']
  const afterPin: ApprovalPermission[] = canViewCost
    ? []
    : required.filter((perm) => perm !== 'pos.editPrice')

  const pin = input.priceOverridePin
  if (!pin) {
    const message = hasOverride
      ? 'Sửa giá yêu cầu mã PIN'
      : hasDiscount
        ? 'Chiết khấu vượt quyền của bạn, cần mã PIN của người có quyền duyệt'
        : 'Giá áp dụng cho đơn cần mã PIN của người có quyền duyệt'
    if (source === 'pos') {
      throw new ApiError('VALIDATION_ERROR', message, { requiredPermissions: beforePin })
    }
    return {
      ...base,
      required,
      approved: false,
      pinVerified: false,
      approver: null,
      missingReason: 'Chưa có mã PIN duyệt',
    }
  }

  try {
    const approver = await verifyApproval({
      db,
      storeId: actor.storeId,
      approverUserId: input.priceApproverId ?? actor.userId,
      pin,
      permissions: beforePin,
      permissionsAfterPin: afterPin,
      requester: { userId: actor.userId, ipAddress: meta?.ipAddress },
      // Đơn ngoại tuyến: PIN nằm sẵn trong payload, mỗi lần đồng bộ lại không được cộng lần sai
      recordFailure: source === 'pos',
      meta,
    })
    return { ...base, required, approved: true, pinVerified: true, approver, missingReason: null }
  } catch (err) {
    if (source === 'pos' || !(err instanceof ApiError)) throw err
    // Đơn đã bán xong tại quầy: không từ chối, nơi gọi đưa đơn vào chờ duyệt (ADR-0009)
    return {
      ...base,
      required,
      approved: false,
      pinVerified: false,
      approver: null,
      missingReason: err.message,
    }
  }
}

// ---------------------------------------------------------------------------
// Duyệt vượt hạn mức nợ (POS-04)
// ---------------------------------------------------------------------------

/**
 * Kiểm PIN duyệt vượt hạn mức của người giữ `pos.overrideDebtLimit` (mặc định chính người bán,
 * đúng khi người bán có quyền). Đơn ngoại tuyến duyệt sai thì coi như không có duyệt: vẫn nhận
 * đơn nhưng đưa vào chờ duyệt (ADR-0009).
 */
export async function resolveDebtLimitApproval({
  db,
  actor,
  input,
  source,
  meta,
}: {
  db: Db
  actor: PolicyActor
  input: CreateOrderInput
  source: 'pos' | 'offline_sync'
  meta?: RequestMeta
}): Promise<Approver | null> {
  if (!input.debtLimitOverridden || !input.debtLimitOverridePin) return null
  try {
    return await verifyApproval({
      db,
      storeId: actor.storeId,
      approverUserId: input.debtLimitApproverId ?? actor.userId,
      pin: input.debtLimitOverridePin,
      permissions: ['pos.overrideDebtLimit'],
      requester: { userId: actor.userId, ipAddress: meta?.ipAddress },
      recordFailure: source === 'pos',
      meta,
    })
  } catch (err) {
    if (source === 'pos' || !(err instanceof ApiError)) throw err
    return null
  }
}

// ---------------------------------------------------------------------------
// Vi phạm chính sách của đơn ngoại tuyến (ADR-0009)
// ---------------------------------------------------------------------------

/** Vi phạm giá hay chiết khấu của đơn ngoại tuyến chưa được duyệt hợp lệ, null nếu không có. */
export function priceViolation(approval: PriceApproval): OrderPolicyViolation | null {
  if (approval.approved) return null
  const belowCost = approval.required.includes('pos.editPriceBelowCost')
  const reason = approval.missingReason ? ` (${approval.missingReason})` : ''
  return {
    code: belowCost ? 'below_cost_unapproved' : 'price_unapproved',
    message: belowCost
      ? `Bán dưới giá vốn mà chưa được chủ cửa hàng duyệt${reason}`
      : `Sửa giá hoặc chiết khấu vượt quyền người bán mà chưa được duyệt${reason}`,
    requiredPermissions: [...approval.required],
  }
}

/** Vi phạm hạn mức nợ: ghi nợ vượt hạn mức hiệu lực mà không có người duyệt hợp lệ. */
export function debtLimitViolation(params: {
  effectiveDebtLimit: number
  debtBefore: number
  debtAfter: number
}): OrderPolicyViolation {
  if (params.effectiveDebtLimit === 0) {
    return {
      code: 'no_credit',
      message: 'Ghi nợ cho khách chưa được cấp hạn mức nợ',
      requiredPermissions: ['pos.overrideDebtLimit'],
    }
  }
  return {
    code: 'debt_limit_exceeded',
    message: `Ghi nợ vượt hạn mức: nợ sau đơn ${params.debtAfter.toLocaleString('vi-VN')}đ, hạn mức ${params.effectiveDebtLimit.toLocaleString('vi-VN')}đ`,
    requiredPermissions: ['pos.overrideDebtLimit'],
  }
}

/**
 * OFF-11 (ADR-0014): giờ bán của đơn ngoại tuyến do máy bán gửi, không tin được hoàn toàn. Giờ bán
 * nằm ngoài khoảng tin được thì đơn ghi theo giờ nhận và gắn cờ để chủ đối chiếu; giờ gốc trả về ở
 * `claimedAt` để lưu vào nhật ký. Khoảng tin được:
 * - không quá SYNC_SOLD_AT_MAX_FUTURE_MS về tương lai (đồng hồ sai, hoặc sửa để dời doanh thu);
 * - không cũ hơn SYNC_SOLD_AT_MAX_AGE_DAYS (đồng hồ chỉnh lùi để đẩy doanh thu vào kỳ đã chốt);
 * - không trước lúc tạo cửa hàng (trừ độ lệch SYNC_SOLD_AT_MAX_FUTURE_MS).
 * Ca bán hàng (PR #58) dùng chung quy tắc này.
 */
export function resolveOfflineSoldAt(
  claimed: string | undefined,
  receivedAt: Date,
  storeCreatedAt: Date | null = null,
): { soldAt: Date; violation: OrderPolicyViolation | null; claimedAt: string | null } {
  const parsed = claimed ? new Date(claimed) : null
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return { soldAt: receivedAt, violation: null, claimedAt: null }
  }
  const replaced = (message: string) => ({
    soldAt: receivedAt,
    claimedAt: parsed.toISOString(),
    violation: {
      code: 'sold_at_suspect' as const,
      message: `${message}, đơn được ghi theo giờ máy chủ nhận đơn`,
      requiredPermissions: ['pos.editPrice' as const],
    },
  })
  if (parsed.getTime() - receivedAt.getTime() > SYNC_SOLD_AT_MAX_FUTURE_MS) {
    return replaced(`Giờ bán trên máy (${formatVnDateTime(parsed)}) ở sau giờ nhận đơn`)
  }
  const maxAgeMs = SYNC_SOLD_AT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  if (receivedAt.getTime() - parsed.getTime() > maxAgeMs) {
    return replaced(
      `Giờ bán trên máy (${formatVnDateTime(parsed)}) cũ hơn ${SYNC_SOLD_AT_MAX_AGE_DAYS} ngày so với giờ nhận đơn`,
    )
  }
  if (storeCreatedAt && storeCreatedAt.getTime() - parsed.getTime() > SYNC_SOLD_AT_MAX_FUTURE_MS) {
    return replaced(`Giờ bán trên máy (${formatVnDateTime(parsed)}) ở trước lúc tạo cửa hàng`)
  }
  return { soldAt: parsed, violation: null, claimedAt: null }
}

function formatVnDateTime(date: Date): string {
  return date.toLocaleString('vi-VN', { timeZone: getStoreTimezone(), hour12: false })
}

/** Quyền được liệt kê người duyệt; cũng là tập quyền hợp lệ cho `/verify-pin` của người khác. */
export function isApprovalPermission(value: string): value is ApprovalPermission {
  return (APPROVAL_PERMISSIONS as readonly string[]).includes(value)
}
