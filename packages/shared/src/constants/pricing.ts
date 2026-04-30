export const PRICE_SOURCES = [
  'customer_price',
  'category_discount',
  'manual_override',
  'volume_price',
  'price_list',
  'retail_price',
] as const

export type PriceSource = (typeof PRICE_SOURCES)[number]

export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  customer_price: 'Giá riêng KH',
  category_discount: 'CK danh mục',
  manual_override: 'Giá chỉnh tay',
  volume_price: 'Giá SL',
  price_list: 'Bảng giá',
  retail_price: 'Giá lẻ',
}
