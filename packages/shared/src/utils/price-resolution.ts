import type { PriceSource } from '../constants/pricing.js'
import type { TierBreakdown } from '../schema/pricing-resolve.js'
import { formatQuantity, mulQty } from './quantity.js'

/**
 * Quy tắc giá 6 tầng của POS, dạng hàm thuần. Máy chủ (`pricing.service.ts`, đọc Postgres) và máy
 * bán hàng ngoại tuyến (`offline/catalog-pricing.ts`, đọc PGlite) chỉ khác nhau ở chỗ lấy dữ liệu
 * nguồn; cách chọn và ghép giá là một, nên cùng khách, cùng số lượng, cùng dữ liệu thì ra cùng giá
 * (OFF-09). Sửa quy tắc giá thì sửa ở đây.
 */

/** Ngày hôm nay (YYYY-MM-DD) theo múi giờ cửa hàng, dùng so với ngày hiệu lực bảng giá, chiết khấu. */
export function storeIsoDate(date: Date = new Date(), timeZone = 'Asia/Ho_Chi_Minh'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export interface EffectiveWindow {
  isActive: boolean
  effectiveFrom: string | null
  effectiveTo: string | null
}

/** Bảng giá hay chiết khấu đang bật và `today` nằm trong khoảng hiệu lực (hai đầu tính cả). */
export function isEffectiveOn(window: EffectiveWindow, today: string): boolean {
  if (!window.isActive) return false
  if (window.effectiveFrom !== null && window.effectiveFrom > today) return false
  if (window.effectiveTo !== null && window.effectiveTo < today) return false
  return true
}

/**
 * POS-08: bảng giá, giá riêng khách và giá theo số lượng gắn được theo biến thể (`variantId`) hoặc
 * theo sản phẩm (`variantId` null, áp cho mọi biến thể). Dòng đang bán là một biến thể mà có dòng
 * riêng của biến thể đó thì chỉ dùng các dòng của biến thể; không có thì dùng các dòng theo sản
 * phẩm. Dòng của biến thể khác không bao giờ được dùng.
 */
export function selectVariantScoped<T extends { variantId: string | null }>(
  rows: T[],
  variantId: string | null,
): T[] {
  if (variantId) {
    const own = rows.filter((row) => row.variantId === variantId)
    if (own.length > 0) return own
  }
  return rows.filter((row) => row.variantId === null)
}

export interface VolumeTierSource {
  minQty: number
  price: number
}

/** Giá theo số lượng: bậc có số lượng tối thiểu lớn nhất mà không vượt số lượng mua. */
export function pickVolumePrice(
  tiers: VolumeTierSource[],
  quantity: number,
): VolumeTierSource | null {
  let best: VolumeTierSource | null = null
  for (const tier of tiers) {
    if (tier.minQty > quantity) continue
    if (!best || tier.minQty > best.minQty) best = tier
  }
  return best
}

export interface CategoryDiscountRule extends EffectiveWindow {
  id: string
  categoryId: string
  customerId: string | null
  customerGroupId: string | null
  discountType: 'percent' | 'amount'
  discountValue: number
  minQty: number
}

/** Chiết khấu danh mục đứng đầu thứ tự ưu tiên mà số lượng (đơn vị tính) đạt ngưỡng */
export function firstCategoryDiscountFor<T extends Pick<CategoryDiscountRule, 'minQty'>>(
  ranked: T[],
  baseQuantity: number,
): T | null {
  return ranked.find((rule) => rule.minQty <= baseQuantity) ?? null
}

/**
 * Các chiết khấu danh mục có thể áp cho khách: đúng danh mục, đang hiệu lực, nhắm đúng khách hoặc
 * nhóm của khách. Xếp ưu tiên quy tắc riêng của khách, rồi giá trị chiết khấu lớn hơn, rồi id nhỏ
 * hơn (cố định kết quả). Chưa lọc ngưỡng số lượng: ngưỡng so với số lượng quy ra đơn vị tính trong
 * `resolvePriceFromSources` (M1).
 */
export function rankCategoryDiscounts(
  rules: CategoryDiscountRule[],
  ctx: {
    categoryId: string | null
    customerId: string | null
    customerGroupId: string | null
    today: string
  },
): CategoryDiscountRule[] {
  const { categoryId, customerId, customerGroupId, today } = ctx
  if (!categoryId || (!customerId && !customerGroupId)) return []

  const matches = rules.filter((rule) => {
    if (rule.categoryId !== categoryId) return false
    if (!isEffectiveOn(rule, today)) return false
    const forCustomer = customerId !== null && rule.customerId === customerId
    const forGroup = customerGroupId !== null && rule.customerGroupId === customerGroupId
    return forCustomer || forGroup
  })
  matches.sort((a, b) => {
    const specific = Number(b.customerId !== null) - Number(a.customerId !== null)
    if (specific !== 0) return specific
    if (b.discountValue !== a.discountValue) return b.discountValue - a.discountValue
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  return matches
}

/** Giá sau chiết khấu danh mục, không âm. */
export function categoryDiscountFinalPrice(
  basePrice: number,
  rule: Pick<CategoryDiscountRule, 'discountType' | 'discountValue'>,
): number {
  const discount =
    rule.discountType === 'percent'
      ? Math.round((basePrice * rule.discountValue) / 100)
      : rule.discountValue
  return Math.max(0, basePrice - discount)
}

export interface NamedListPrice {
  price: number
  priceListName: string
}

export type CategoryDiscountCandidate = Pick<
  CategoryDiscountRule,
  'discountType' | 'discountValue' | 'minQty'
>

/**
 * Số lượng dùng so ngưỡng giá theo số lượng và chiết khấu danh mục: quy ra đơn vị tính (M1). Ngưỡng
 * khai theo đơn vị tính như giá của các bậc, nên bán 1 thùng 24 lon là 24. Nhân qua mulQty (ADR-0015):
 * 0,58 bao 50 kg đúng bằng 29 kg, nhân float ra 28,999999999999996 thì trượt ngưỡng 29.
 */
export function pricingBaseQuantity(
  quantity: number,
  unitConversion: { conversionFactor: number } | null,
): number {
  return mulQty(quantity, unitConversion?.conversionFactor ?? 1)
}

/** Dữ liệu nguồn của một dòng hàng, do nơi gọi đọc từ cơ sở dữ liệu của mình. */
export interface PriceSources {
  /** Số lượng của dòng theo đơn vị đang bán (đơn vị quy đổi nếu có) */
  quantity: number
  /** null: hàng không tồn tại (hoặc đã xóa) trong cửa hàng */
  product: { sellingPrice: number } | null
  /** Giá bán biến thể khi dòng có biến thể và biến thể còn tồn tại */
  variantSellingPrice: number | null
  unitConversion: { conversionFactor: number; sellingPrice: number | null } | null
  /** Có khi thu ngân chọn bảng giá: `item` null nghĩa là hàng không có trong bảng giá đó */
  manualPriceList: { item: NamedListPrice | null } | null
  /** Có khi đơn gắn khách */
  customer: {
    customerPrice: number | null
    /** Chiết khấu danh mục áp được cho khách, đã xếp ưu tiên (`rankCategoryDiscounts`) */
    categoryDiscounts: CategoryDiscountCandidate[]
    groupPriceList: NamedListPrice | null
  } | null
  /** Mọi bậc giá theo số lượng của dòng (đã chọn theo biến thể), chưa lọc ngưỡng */
  volumeTiers: VolumeTierSource[]
}

export interface ResolvedPrice {
  price: number
  source: PriceSource
  sourceDetail: string | null
  isFallback?: boolean
  breakdown: TierBreakdown[]
}

/**
 * Ghép giá theo thứ tự ưu tiên: bảng giá thu ngân chọn, giá riêng khách, chiết khấu danh mục, giá
 * theo số lượng, bảng giá của nhóm khách, giá bán của đơn vị quy đổi, giá bán (CONTEXT.md, "Thứ tự
 * nguồn giá"). Các nguồn đặc biệt khai cho đơn vị tính nên dòng bán theo đơn vị quy đổi lấy giá
 * nguồn nhân hệ số quy đổi; giá bán riêng của đơn vị quy đổi chỉ thay cho giá bán (POS-16), không
 * đè lên nguồn đặc biệt, và khi nó được dùng thì nguồn giá là giá bán.
 */
export function resolvePriceFromSources(sources: PriceSources): ResolvedPrice {
  if (!sources.product) {
    return {
      price: 0,
      source: 'retail_price',
      sourceDetail: null,
      isFallback: false,
      breakdown: [],
    }
  }

  let rawRetailPrice = sources.product.sellingPrice
  if (sources.variantSellingPrice !== null && sources.variantSellingPrice > 0) {
    rawRetailPrice = sources.variantSellingPrice
  }

  const unitConv = sources.unitConversion
  const conversionFactor = unitConv?.conversionFactor ?? 1
  const retailPrice = unitConv?.sellingPrice ?? Math.round(rawRetailPrice * conversionFactor)
  const scaled = (raw: number) => Math.round(raw * conversionFactor)
  // M1: ngưỡng số lượng so theo đơn vị tính, cùng đơn vị với giá của bậc. Mỗi dòng giỏ tính riêng,
  // không gộp các dòng cùng hàng khác đơn vị.
  const baseQuantity = pricingBaseQuantity(sources.quantity, unitConv)

  const breakdown: TierBreakdown[] = []
  let winner: { price: number; source: PriceSource; sourceDetail: string | null } | null = null
  let isFallback = false

  if (sources.manualPriceList) {
    const manualItem = sources.manualPriceList.item
    if (manualItem) {
      // Bảng giá thu ngân chọn thắng cả giá bán riêng của đơn vị quy đổi (nhân hệ số)
      const manualPrice = scaled(manualItem.price)
      winner = { price: manualPrice, source: 'price_list', sourceDetail: manualItem.priceListName }
      breakdown.push({
        tier: 1,
        name: `Bảng giá (${manualItem.priceListName})`,
        price: manualPrice,
        matched: true,
        reason: `Bảng giá: ${manualItem.priceListName}`,
      })
    } else {
      isFallback = true
      breakdown.push({
        tier: 1,
        name: 'Bảng giá thủ công',
        price: null,
        matched: false,
        reason: 'Không có trong bảng giá đã chọn (dùng giá dự phòng)',
      })
    }
  }

  if (sources.customer) {
    const rawCp = sources.customer.customerPrice
    const cp = rawCp !== null ? scaled(rawCp) : null
    const t1Hit = !winner && cp !== null && cp >= 0
    breakdown.push({
      tier: 1,
      name: 'Giá riêng khách hàng',
      price: cp,
      matched: t1Hit,
      reason: cp !== null ? `Giá riêng: ${cp.toLocaleString('vi-VN')}đ` : 'Không có giá riêng',
    })
    if (t1Hit) {
      winner = {
        price: cp!,
        source: 'customer_price',
        sourceDetail: isFallback
          ? 'Giá dự phòng: Giá riêng cho khách hàng'
          : 'Giá riêng cho khách hàng',
      }
    }

    const rule = firstCategoryDiscountFor(sources.customer.categoryDiscounts, baseQuantity)
    // Chiết khấu danh mục là nguồn đặc biệt: tính trên giá bán đơn vị cơ bản rồi nhân hệ số (POS-16)
    const catFinal = rule ? scaled(categoryDiscountFinalPrice(rawRetailPrice, rule)) : null
    const catDetail = rule
      ? rule.discountType === 'percent'
        ? `Giảm ${rule.discountValue}%`
        : `Giảm ${rule.discountValue.toLocaleString('vi-VN')}đ`
      : null
    const t2Hit = !winner && catFinal !== null && catFinal >= 0
    breakdown.push({
      tier: 2,
      name: 'Chiết khấu danh mục',
      price: catFinal,
      matched: t2Hit,
      reason: catDetail ?? 'Không có chiết khấu danh mục',
    })
    if (t2Hit) {
      winner = {
        price: catFinal!,
        source: 'category_discount',
        sourceDetail: isFallback ? `Giá dự phòng: ${catDetail}` : catDetail,
      }
    }
  } else {
    breakdown.push({
      tier: 1,
      name: 'Giá riêng khách hàng',
      price: null,
      matched: false,
      reason: 'Khách lẻ',
    })
    breakdown.push({
      tier: 2,
      name: 'Chiết khấu danh mục',
      price: null,
      matched: false,
      reason: 'Khách lẻ',
    })
  }

  breakdown.push({
    tier: 3,
    name: 'Giá chỉnh tay',
    price: null,
    matched: false,
    reason: 'Client state',
  })

  const rawVp = pickVolumePrice(sources.volumeTiers, baseQuantity)
  const vpPrice = rawVp !== null ? scaled(rawVp.price) : null
  const t4Hit = !winner && vpPrice !== null && vpPrice >= 0
  breakdown.push({
    tier: 4,
    name: 'Giá theo số lượng',
    price: vpPrice,
    matched: t4Hit,
    reason:
      rawVp !== null
        ? `SL >= ${formatQuantity(rawVp.minQty)}: ${vpPrice?.toLocaleString('vi-VN')}đ`
        : 'Không có giá theo số lượng phù hợp',
  })
  if (t4Hit) {
    winner = {
      price: vpPrice!,
      source: 'volume_price',
      sourceDetail: isFallback
        ? `Giá dự phòng: SL >= ${formatQuantity(rawVp!.minQty)}`
        : `SL >= ${formatQuantity(rawVp!.minQty)}`,
    }
  }

  if (sources.customer) {
    const rawPlp = sources.customer.groupPriceList
    const plpPrice = rawPlp !== null ? scaled(rawPlp.price) : null
    const t5Hit = !winner && plpPrice !== null && plpPrice >= 0
    breakdown.push({
      tier: 5,
      name: 'Bảng giá nhóm khách hàng',
      price: plpPrice,
      matched: t5Hit,
      reason: rawPlp ? `Bảng giá: ${rawPlp.priceListName}` : 'Không có bảng giá nhóm',
    })
    if (t5Hit) {
      winner = {
        price: plpPrice!,
        source: 'price_list',
        sourceDetail: isFallback ? `Giá dự phòng: ${rawPlp!.priceListName}` : rawPlp!.priceListName,
      }
    }
  } else {
    breakdown.push({
      tier: 5,
      name: 'Bảng giá nhóm khách hàng',
      price: null,
      matched: false,
      reason: 'Khách lẻ',
    })
  }

  const t6Hit = !winner
  breakdown.push({
    tier: 6,
    name: 'Giá bán lẻ',
    price: retailPrice,
    matched: t6Hit,
    reason: `Giá lẻ: ${retailPrice.toLocaleString('vi-VN')}đ`,
  })

  if (winner) return { ...winner, isFallback, breakdown }
  return {
    price: retailPrice,
    source: 'retail_price',
    sourceDetail: isFallback ? 'Giá dự phòng: Giá bán lẻ' : null,
    isFallback,
    breakdown,
  }
}
