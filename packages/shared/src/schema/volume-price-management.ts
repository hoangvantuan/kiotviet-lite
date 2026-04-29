import { z } from 'zod'

import { priceSchema } from './price-list-management.js'

export const volumeMinQtySchema = z
  .number({ required_error: 'Vui lòng nhập số lượng tối thiểu' })
  .int('Số lượng tối thiểu phải là số nguyên')
  .min(1, 'Số lượng tối thiểu phải ≥ 1')
  .max(1_000_000, 'Số lượng tối thiểu vượt giới hạn cho phép')

export const volumePriceTierInputSchema = z.object({
  minQty: volumeMinQtySchema,
  price: priceSchema,
})

export const replaceVolumePricesSchema = z
  .object({
    tiers: z
      .array(volumePriceTierInputSchema)
      .max(5, 'Tối đa 5 mức giá theo số lượng cho mỗi sản phẩm')
      .default([]),
  })
  .superRefine((data, ctx) => {
    const { tiers } = data
    if (tiers.length <= 1) return

    // Check duplicate minQty
    const seen = new Map<number, number>()
    for (let i = 0; i < tiers.length; i++) {
      const q = tiers[i]!.minQty
      if (seen.has(q)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tiers', i, 'minQty'],
          message: 'Số lượng tối thiểu không được trùng nhau',
        })
      } else {
        seen.set(q, i)
      }
    }

    // Check strictly descending price by minQty ASC
    const sorted = tiers.map((t, idx) => ({ ...t, idx })).sort((a, b) => a.minQty - b.minQty)
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!
      const cur = sorted[i]!
      if (prev.minQty === cur.minQty) continue // duplicate already reported
      if (cur.price >= prev.price) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tiers', cur.idx, 'price'],
          message: 'Giá phải giảm dần khi số lượng tăng',
        })
      }
    }
  })

export const listVolumePricesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
})

export const volumePriceTierSchema = z.object({
  id: z.string().uuid(),
  minQty: z.number().int(),
  price: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const volumePricesForProductSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  productSku: z.string(),
  productImageUrl: z.string().nullable(),
  productSellingPrice: z.number(),
  productCostPrice: z.number().nullable(),
  tiers: z.array(volumePriceTierSchema),
})

export const volumePricesListItemSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  productSku: z.string(),
  productImageUrl: z.string().nullable(),
  productSellingPrice: z.number(),
  productCostPrice: z.number().nullable(),
  tierCount: z.number().int().min(0),
  minPrice: z.number(),
  maxPrice: z.number(),
  topTiers: z.array(volumePriceTierSchema),
})

export type VolumePriceTierInput = z.infer<typeof volumePriceTierInputSchema>
export type ReplaceVolumePricesInput = z.infer<typeof replaceVolumePricesSchema>
export type ListVolumePricesQuery = z.infer<typeof listVolumePricesQuerySchema>
export type VolumePriceTier = z.infer<typeof volumePriceTierSchema>
export type VolumePricesForProduct = z.infer<typeof volumePricesForProductSchema>
export type VolumePricesListItem = z.infer<typeof volumePricesListItemSchema>
