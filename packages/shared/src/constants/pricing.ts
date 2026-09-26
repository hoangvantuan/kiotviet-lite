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
  customer_price: 'Giá riêng',
  category_discount: 'Chiết khấu danh mục',
  manual_override: 'Sửa giá',
  volume_price: 'Giá theo số lượng',
  price_list: 'Bảng giá',
  retail_price: 'Giá lẻ',
}
