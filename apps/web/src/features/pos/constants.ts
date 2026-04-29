export const MAX_CART_TABS = 5

export const DISCOUNT_TYPE = {
  PERCENT: 'percent',
  AMOUNT: 'amount',
} as const

export type DiscountType = (typeof DISCOUNT_TYPE)[keyof typeof DISCOUNT_TYPE]
