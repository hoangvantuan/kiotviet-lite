import { z } from 'zod'

import { NAME_REGEX } from '../constants/regex.js'

export const brandNameSchema = z
  .string({ required_error: 'Vui lòng nhập tên thương hiệu' })
  .trim()
  .min(1, 'Vui lòng nhập tên thương hiệu')
  .max(100, 'Tên thương hiệu tối đa 100 ký tự')
  .regex(NAME_REGEX, 'Tên thương hiệu chứa ký tự không hợp lệ')

export const createBrandSchema = z.object({ name: brandNameSchema })
export const updateBrandSchema = z.object({ name: brandNameSchema })
export const listBrandsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(['active', 'trashed']).default('active'),
})

export const brandItemSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  name: z.string(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type CreateBrandInput = z.infer<typeof createBrandSchema>
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>
export type ListBrandsQuery = z.infer<typeof listBrandsQuerySchema>
export type BrandItem = z.infer<typeof brandItemSchema>
