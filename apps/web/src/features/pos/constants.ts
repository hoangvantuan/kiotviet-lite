export const MAX_CART_TABS = 5

/** R4: ý định lưu đơn của POS, mỗi tab giỏ hàng giữ một khóa riêng (`pos.order:<tab>`) */
export const POS_ORDER_INTENT = 'pos.order'

export const DISCOUNT_TYPE = {
  PERCENT: 'percent',
  AMOUNT: 'amount',
} as const

export type DiscountType = (typeof DISCOUNT_TYPE)[keyof typeof DISCOUNT_TYPE]
