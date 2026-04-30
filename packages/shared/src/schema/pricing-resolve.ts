import { z } from 'zod'

import { PRICE_SOURCES } from '../constants/pricing.js'

export const priceSourceSchema = z.enum(PRICE_SOURCES)

export const resolvePriceItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1),
})

export const resolvePricesSchema = z
  .object({
    customerId: z.string().uuid().nullable().optional(),
    items: z.array(resolvePriceItemSchema).min(1).max(100),
  })
  .strict()

export const tierBreakdownSchema = z.object({
  tier: z.number().int().min(1).max(6),
  name: z.string(),
  price: z.number().nullable(),
  matched: z.boolean(),
  reason: z.string().nullable(),
})

export const resolvedPriceItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  price: z.number().int().min(0),
  source: priceSourceSchema,
  sourceDetail: z.string().nullable(),
  breakdown: z.array(tierBreakdownSchema).optional(),
})

export type ResolvePriceItem = z.infer<typeof resolvePriceItemSchema>
export type ResolvePricesInput = z.infer<typeof resolvePricesSchema>
export type TierBreakdown = z.infer<typeof tierBreakdownSchema>
export type ResolvedPriceItem = z.infer<typeof resolvedPriceItemSchema>
