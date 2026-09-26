import type { PriceSource } from '../constants/pricing.js'
import type { TierBreakdown } from '../schema/pricing-resolve.js'

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

/**
 * Chiết khấu danh mục áp cho khách: đúng danh mục, đang hiệu lực, đủ số lượng, nhắm đúng khách hoặc
 * nhóm của khách. Nhiều quy tắc cùng khớp thì ưu tiên quy tắc riêng của khách, rồi giá trị chiết
 * khấu lớn hơn, rồi id nhỏ hơn (cố định kết quả).
 */
export function pickCategoryDiscount(
  rules: CategoryDiscountRule[],
  ctx: {
    categoryId: string | null
    customerId: string | null
    customerGroupId: string | null
    quantity: number
    today: string
  },
): CategoryDiscountRule | null {
  const { categoryId, customerId, customerGroupId, quantity, today } = ctx
  if (!categoryId || (!customerId && !customerGroupId)) return null

  const matches = rules.filter((rule) => {
    if (rule.categoryId !== categoryId) return false
    if (rule.minQty > quantity) return false
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
  return matches[0] ?? null
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

/** Dữ liệu nguồn của một dòng hàng, do nơi gọi đọc từ cơ sở dữ liệu của mình. */
export interface PriceSources {
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
    categoryDiscount: Pick<CategoryDiscountRule, 'discountType' | 'discountValue'> | null
    groupPriceList: NamedListPrice | null
  } | null
  volumePrice: VolumeTierSource | null
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
 * theo số lượng, bảng giá của nhóm khách, giá bán lẻ. Giá nguồn tính cho đơn vị cơ bản được nhân hệ
 * số quy đổi, trừ khi đơn vị quy đổi có giá bán riêng.
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
  const scaled = (raw: number) => unitConv?.sellingPrice ?? Math.round(raw * conversionFactor)

  const breakdown: TierBreakdown[] = []
  let winner: { price: number; source: PriceSource; sourceDetail: string | null } | null = null
  let isFallback = false

  if (sources.manualPriceList) {
    const manualItem = sources.manualPriceList.item
    if (manualItem) {
      // Bảng giá thu ngân chọn thắng cả giá bán riêng của đơn vị quy đổi (nhân hệ số)
      const manualPrice = Math.round(manualItem.price * conversionFactor)
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
      name: 'Giá riêng KH',
      price: cp,
      matched: t1Hit,
      reason: cp !== null ? `Giá riêng: ${cp.toLocaleString('vi-VN')}đ` : 'Không có giá riêng',
    })
    if (t1Hit) {
      winner = {
        price: cp!,
        source: 'customer_price',
        sourceDetail: isFallback ? 'Giá dự phòng: Giá riêng cho KH' : 'Giá riêng cho KH',
      }
    }

    const rule = sources.customer.categoryDiscount
    const catFinal = rule ? categoryDiscountFinalPrice(retailPrice, rule) : null
    const catDetail = rule
      ? rule.discountType === 'percent'
        ? `Giảm ${rule.discountValue}%`
        : `Giảm ${rule.discountValue.toLocaleString('vi-VN')}đ`
      : null
    const t2Hit = !winner && catFinal !== null && catFinal >= 0
    breakdown.push({
      tier: 2,
      name: 'CK danh mục',
      price: catFinal,
      matched: t2Hit,
      reason: catDetail ?? 'Không có CK danh mục',
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
      name: 'Giá riêng KH',
      price: null,
      matched: false,
      reason: 'Khách lẻ',
    })
    breakdown.push({
      tier: 2,
      name: 'CK danh mục',
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

  const rawVp = sources.volumePrice
  const vpPrice = rawVp !== null ? scaled(rawVp.price) : null
  const t4Hit = !winner && vpPrice !== null && vpPrice >= 0
  breakdown.push({
    tier: 4,
    name: 'Giá theo SL',
    price: vpPrice,
    matched: t4Hit,
    reason:
      rawVp !== null
        ? `SL >= ${rawVp.minQty}: ${vpPrice?.toLocaleString('vi-VN')}đ`
        : 'Không có giá SL phù hợp',
  })
  if (t4Hit) {
    winner = {
      price: vpPrice!,
      source: 'volume_price',
      sourceDetail: isFallback ? `Giá dự phòng: SL >= ${rawVp!.minQty}` : `SL >= ${rawVp!.minQty}`,
    }
  }

  if (sources.customer) {
    const rawPlp = sources.customer.groupPriceList
    const plpPrice = rawPlp !== null ? scaled(rawPlp.price) : null
    const t5Hit = !winner && plpPrice !== null && plpPrice >= 0
    breakdown.push({
      tier: 5,
      name: 'Bảng giá nhóm KH',
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
      name: 'Bảng giá nhóm KH',
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
