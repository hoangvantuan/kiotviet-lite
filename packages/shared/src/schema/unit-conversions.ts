import { z } from 'zod'

export const unitConversionInputSchema = z.object({
  unit: z.string().trim().min(1, 'Đơn vị không được trống').max(32, 'Đơn vị tối đa 32 ký tự'),
  conversionFactor: z
    .number()
    .int('Hệ số phải là số nguyên')
    .min(2, 'Hệ số quy đổi phải > 1')
    .max(100_000, 'Hệ số tối đa 100.000'),
  sellingPrice: z.number().int('Giá phải là số nguyên').min(0, 'Giá ≥ 0'),
  sortOrder: z.number().int().min(0).default(0).optional(),
})

export const unitConversionUpdateSchema = unitConversionInputSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Cần ít nhất một trường để cập nhật',
  })

export const unitConversionItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  unit: z.string(),
  conversionFactor: z.number(),
  sellingPrice: z.number(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type UnitConversionInput = z.infer<typeof unitConversionInputSchema>
export type UnitConversionUpdate = z.infer<typeof unitConversionUpdateSchema>
export type UnitConversionItem = z.infer<typeof unitConversionItemSchema>
