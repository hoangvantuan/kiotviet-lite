import { z } from 'zod'

export const categoryDiscountTypeSchema = z.enum(['percent', 'amount'], {
  required_error: 'Vui lòng chọn loại chiết khấu',
})

export const effectiveStatusSchema = z.enum(['pending', 'active', 'expired', 'inactive'])

export const categoryDiscountValueSchema = z
  .number({ required_error: 'Vui lòng nhập mức giảm', invalid_type_error: 'Mức giảm phải là số' })
  .int('Mức giảm phải là số nguyên')
  .min(0, 'Mức giảm phải ≥ 0')
  .max(9_999_999_999_999, 'Mức giảm vượt giới hạn cho phép')

export const categoryDiscountMinQtySchema = z
  .number({ required_error: 'Vui lòng nhập số lượng tối thiểu' })
  .int('Số lượng tối thiểu phải là số nguyên')
  .min(1, 'Số lượng tối thiểu phải ≥ 1')
  .max(1_000_000, 'Số lượng tối thiểu vượt giới hạn cho phép')

export const categoryDiscountNoteSchema = z
  .string()
  .trim()
  .max(255, 'Ghi chú tối đa 255 ký tự')
  .nullable()
  .optional()

const dateOrNullSchema = z.string().date('Ngày không hợp lệ').nullable().optional()

const createCategoryDiscountBaseSchema = z
  .object({
    categoryId: z.string().uuid('Danh mục không hợp lệ'),
    customerId: z.string().uuid('Khách hàng không hợp lệ').nullable().optional(),
    customerGroupId: z.string().uuid('Nhóm khách hàng không hợp lệ').nullable().optional(),
    discountType: categoryDiscountTypeSchema,
    discountValue: categoryDiscountValueSchema,
    minQty: categoryDiscountMinQtySchema.default(1),
    effectiveFrom: dateOrNullSchema,
    effectiveTo: dateOrNullSchema,
    isActive: z.boolean().default(true),
    note: categoryDiscountNoteSchema,
  })
  .strict()

const refineCategoryDiscount = (
  data: {
    customerId?: string | null
    customerGroupId?: string | null
    discountType?: 'percent' | 'amount'
    discountValue?: number
    effectiveFrom?: string | null
    effectiveTo?: string | null
  },
  ctx: z.RefinementCtx,
) => {
  const hasCustomer = data.customerId !== null && data.customerId !== undefined
  const hasGroup = data.customerGroupId !== null && data.customerGroupId !== undefined
  if (!hasCustomer && !hasGroup) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customerId'],
      message: 'Chọn 1 khách hàng hoặc 1 nhóm khách hàng',
    })
  } else if (hasCustomer && hasGroup) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customerGroupId'],
      message: 'Chỉ chọn 1 khách hàng HOẶC 1 nhóm, không cả hai',
    })
  }

  if (
    data.discountType === 'percent' &&
    data.discountValue !== undefined &&
    data.discountValue > 100
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['discountValue'],
      message: 'Phần trăm giảm phải ≤ 100',
    })
  }

  if (data.effectiveFrom && data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['effectiveTo'],
      message: 'Ngày kết thúc phải ≥ ngày bắt đầu',
    })
  }
}

export const createCategoryDiscountSchema =
  createCategoryDiscountBaseSchema.superRefine(refineCategoryDiscount)

export const updateCategoryDiscountSchema = z
  .object({
    discountType: categoryDiscountTypeSchema.optional(),
    discountValue: categoryDiscountValueSchema.optional(),
    minQty: categoryDiscountMinQtySchema.optional(),
    effectiveFrom: dateOrNullSchema,
    effectiveTo: dateOrNullSchema,
    isActive: z.boolean().optional(),
    note: categoryDiscountNoteSchema,
  })
  .strict()
  .refine(
    (data) =>
      data.discountType !== undefined ||
      data.discountValue !== undefined ||
      data.minQty !== undefined ||
      data.effectiveFrom !== undefined ||
      data.effectiveTo !== undefined ||
      data.isActive !== undefined ||
      data.note !== undefined,
    { message: 'Cần ít nhất một trường để cập nhật' },
  )
  .superRefine((data, ctx) => {
    if (
      data.discountType === 'percent' &&
      data.discountValue !== undefined &&
      data.discountValue > 100
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountValue'],
        message: 'Phần trăm giảm phải ≤ 100',
      })
    }
    if (data.effectiveFrom && data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['effectiveTo'],
        message: 'Ngày kết thúc phải ≥ ngày bắt đầu',
      })
    }
  })

export const listCategoryDiscountsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: z.string().uuid('Danh mục không hợp lệ').optional(),
  customerId: z.string().uuid('Khách hàng không hợp lệ').optional(),
  customerGroupId: z.string().uuid('Nhóm khách hàng không hợp lệ').optional(),
  isActive: z.coerce.boolean().optional(),
  effectiveStatus: effectiveStatusSchema.optional(),
  search: z.string().trim().optional(),
})

export const categoryDiscountListItemSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  categoryName: z.string(),
  customerId: z.string().uuid().nullable(),
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  customerGroupId: z.string().uuid().nullable(),
  customerGroupName: z.string().nullable(),
  discountType: categoryDiscountTypeSchema,
  discountValue: z.number(),
  minQty: z.number().int(),
  effectiveFrom: z.string().nullable(),
  effectiveTo: z.string().nullable(),
  isActive: z.boolean(),
  effectiveStatus: effectiveStatusSchema,
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type CategoryDiscountType = z.infer<typeof categoryDiscountTypeSchema>
export type EffectiveStatus = z.infer<typeof effectiveStatusSchema>
export type CreateCategoryDiscountInput = z.infer<typeof createCategoryDiscountSchema>
export type UpdateCategoryDiscountInput = z.infer<typeof updateCategoryDiscountSchema>
export type ListCategoryDiscountsQuery = z.infer<typeof listCategoryDiscountsQuerySchema>
export type CategoryDiscountListItem = z.infer<typeof categoryDiscountListItemSchema>
