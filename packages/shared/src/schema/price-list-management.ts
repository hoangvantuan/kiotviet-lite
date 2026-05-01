import { z } from 'zod'

const NAME_REGEX = /^[\p{L}\p{N}\s\-_&()'./,]+$/u

export const priceListMethodSchema = z.enum(['direct', 'formula', 'chain'])
export const formulaTypeSchema = z.enum([
  'percent_increase',
  'percent_decrease',
  'amount_increase',
  'amount_decrease',
])
export const roundingRuleSchema = z.enum([
  'none',
  'nearest_hundred',
  'nearest_five_hundred',
  'nearest_thousand',
  'ceil_hundred',
  'ceil_five_hundred',
  'ceil_thousand',
  'floor_hundred',
  'floor_five_hundred',
  'floor_thousand',
])
export const priceListStatusFilterSchema = z.enum([
  'all',
  'effective',
  'inactive',
  'expired',
  'pending',
])

export const priceListNameSchema = z
  .string({ required_error: 'Vui lòng nhập tên bảng giá' })
  .trim()
  .min(1, 'Vui lòng nhập tên bảng giá')
  .max(100, 'Tên bảng giá tối đa 100 ký tự')
  .regex(NAME_REGEX, 'Tên bảng giá chứa ký tự không hợp lệ')

export const priceSchema = z
  .number({ required_error: 'Vui lòng nhập giá', invalid_type_error: 'Giá phải là số' })
  .int('Giá phải là số nguyên')
  .min(0, 'Giá phải ≥ 0')
  .max(9_999_999_999_999, 'Giá vượt giới hạn cho phép')

export const formulaValueSchema = z
  .number({ required_error: 'Vui lòng nhập giá trị công thức' })
  .int('Giá trị công thức phải là số nguyên')
  .min(0, 'Giá trị công thức phải ≥ 0')
  .max(1_000_000_000, 'Giá trị công thức vượt giới hạn cho phép')

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày phải là YYYY-MM-DD')
  .nullable()
  .optional()

export const priceListItemInputSchema = z.object({
  productId: z.string().uuid('Sản phẩm không hợp lệ'),
  price: priceSchema,
})

const directBranch = z.object({
  method: z.literal('direct'),
  name: priceListNameSchema,
  description: z.string().trim().max(255, 'Mô tả tối đa 255 ký tự').nullable().optional(),
  roundingRule: roundingRuleSchema.default('none'),
  effectiveFrom: dateStringSchema,
  effectiveTo: dateStringSchema,
  isActive: z.boolean().default(true),
  items: z.array(priceListItemInputSchema).default([]),
})

const formulaBranch = z.object({
  method: z.literal('formula'),
  name: priceListNameSchema,
  description: z.string().trim().max(255, 'Mô tả tối đa 255 ký tự').nullable().optional(),
  baseListId: z.string().uuid('Bảng giá nền không hợp lệ'),
  formulaType: formulaTypeSchema,
  formulaValue: formulaValueSchema,
  roundingRule: roundingRuleSchema.default('none'),
  effectiveFrom: dateStringSchema,
  effectiveTo: dateStringSchema,
  isActive: z.boolean().default(true),
  overrides: z.array(priceListItemInputSchema).default([]),
})

const chainBranch = z.object({
  method: z.literal('chain'),
  name: priceListNameSchema,
  description: z.string().trim().max(255, 'Mô tả tối đa 255 ký tự').nullable().optional(),
  baseListId: z.string().uuid('Bảng giá nền không hợp lệ'),
  formulaType: formulaTypeSchema,
  formulaValue: formulaValueSchema,
  roundingRule: roundingRuleSchema.default('none'),
  effectiveFrom: dateStringSchema,
  effectiveTo: dateStringSchema,
  isActive: z.boolean().default(true),
  overrides: z.array(priceListItemInputSchema).default([]),
})

export const createPriceListSchema = z
  .discriminatedUnion('method', [directBranch, formulaBranch, chainBranch])
  .superRefine((data, ctx) => {
    if (data.effectiveFrom && data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
      ctx.addIssue({
        code: 'custom',
        path: ['effectiveTo'],
        message: 'Ngày kết thúc phải sau ngày bắt đầu',
      })
    }
  })

export const updatePriceListSchema = z
  .object({
    name: priceListNameSchema.optional(),
    description: z.string().trim().max(255, 'Mô tả tối đa 255 ký tự').nullable().optional(),
    roundingRule: roundingRuleSchema.optional(),
    effectiveFrom: dateStringSchema,
    effectiveTo: dateStringSchema,
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).some((k) => d[k as keyof typeof d] !== undefined), {
    message: 'Cần ít nhất một trường để cập nhật',
  })
  .superRefine((data, ctx) => {
    if (data.effectiveFrom && data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
      ctx.addIssue({
        code: 'custom',
        path: ['effectiveTo'],
        message: 'Ngày kết thúc phải sau ngày bắt đầu',
      })
    }
  })

export const updatePriceListItemSchema = z.object({
  price: priceSchema,
})

export const createPriceListItemSchema = priceListItemInputSchema

export const listPriceListsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  method: priceListMethodSchema.optional(),
  status: priceListStatusFilterSchema.default('all'),
})

export const listPriceListItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().optional(),
})

export const listTrashedPriceListsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const priceListListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  method: priceListMethodSchema,
  baseListId: z.string().uuid().nullable(),
  baseName: z.string().nullable(),
  formulaType: formulaTypeSchema.nullable(),
  formulaValue: z.number().nullable(),
  roundingRule: roundingRuleSchema,
  effectiveFrom: z.string().nullable(),
  effectiveTo: z.string().nullable(),
  isActive: z.boolean(),
  effectiveActive: z.boolean(),
  itemCount: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const priceListDetailSchema = priceListListItemSchema.extend({
  storeId: z.string().uuid(),
  deletedAt: z.string().nullable(),
})

export const priceListItemListItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  productSku: z.string(),
  productImageUrl: z.string().nullable(),
  productSellingPrice: z.number(),
  productCostPrice: z.number().nullable(),
  price: z.number(),
  isOverridden: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const clonePriceListSchema = z.object({
  name: priceListNameSchema,
  isActive: z.boolean().default(false),
  description: z.string().trim().max(255, 'Mô tả tối đa 255 ký tự').nullable().optional(),
})

export const importPriceListSchema = z.object({
  csvText: z
    .string({ required_error: 'Vui lòng nhập nội dung CSV' })
    .min(1, 'Nội dung CSV không được để trống')
    .max(500_000, 'Nội dung CSV vượt giới hạn cho phép'),
  mode: z.enum(['upsert', 'replace']).default('upsert'),
})

export const importPriceListErrorSchema = z.object({
  row: z.number().int().min(1),
  code: z.string(),
  reason: z.string(),
})

export const importPriceListSummarySchema = z.object({
  totalRows: z.number().int().min(0),
  imported: z.number().int().min(0),
  skipped: z.number().int().min(0),
  errors: z.array(importPriceListErrorSchema),
})

export const comparePriceListsQuerySchema = z
  .object({
    listAId: z.string().uuid('ID bảng giá A không hợp lệ'),
    listBId: z.string().uuid('ID bảng giá B không hợp lệ'),
  })
  .superRefine((data, ctx) => {
    if (data.listAId === data.listBId) {
      ctx.addIssue({
        code: 'custom',
        path: ['listBId'],
        message: 'Hai bảng giá so sánh phải khác nhau',
      })
    }
  })

export const compareRowSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  productSku: z.string(),
  productImageUrl: z.string().nullable(),
  productSellingPrice: z.number().int().min(0),
  productCostPrice: z.number().int().min(0).nullable(),
  priceA: z.number().int().min(0).nullable(),
  priceB: z.number().int().min(0).nullable(),
  diffAmount: z.number().int().nullable(),
  diffPercent: z.number().nullable(),
  marginA: z.number().nullable(),
  marginB: z.number().nullable(),
  isBelowCostA: z.boolean(),
  isBelowCostB: z.boolean(),
  isMissingA: z.boolean(),
  isMissingB: z.boolean(),
})

export const compareSummarySchema = z.object({
  totalProducts: z.number().int().min(0),
  bothCount: z.number().int().min(0),
  onlyACount: z.number().int().min(0),
  onlyBCount: z.number().int().min(0),
  diffOver10Count: z.number().int().min(0),
  belowCostBCount: z.number().int().min(0),
  belowCostACount: z.number().int().min(0),
})

export const comparePriceListsResponseSchema = z.object({
  listA: priceListDetailSchema,
  listB: priceListDetailSchema,
  rows: z.array(compareRowSchema),
  summary: compareSummarySchema,
})

export type PriceListMethod = z.infer<typeof priceListMethodSchema>
export type FormulaType = z.infer<typeof formulaTypeSchema>
export type RoundingRule = z.infer<typeof roundingRuleSchema>
export type PriceListStatusFilter = z.infer<typeof priceListStatusFilterSchema>
export type CreatePriceListInput = z.infer<typeof createPriceListSchema>
export type UpdatePriceListInput = z.infer<typeof updatePriceListSchema>
export type CreatePriceListItemInput = z.infer<typeof createPriceListItemSchema>
export type UpdatePriceListItemInput = z.infer<typeof updatePriceListItemSchema>
export type ListPriceListsQuery = z.infer<typeof listPriceListsQuerySchema>
export type ListPriceListItemsQuery = z.infer<typeof listPriceListItemsQuerySchema>
export type ListTrashedPriceListsQuery = z.infer<typeof listTrashedPriceListsQuerySchema>
export type PriceListListItem = z.infer<typeof priceListListItemSchema>
export type PriceListDetail = z.infer<typeof priceListDetailSchema>
export type PriceListItemListItem = z.infer<typeof priceListItemListItemSchema>
export type ClonePriceListInput = z.infer<typeof clonePriceListSchema>
export type ImportPriceListInput = z.infer<typeof importPriceListSchema>
export type ImportPriceListError = z.infer<typeof importPriceListErrorSchema>
export type ImportPriceListSummary = z.infer<typeof importPriceListSummarySchema>
export type ComparePriceListsQuery = z.infer<typeof comparePriceListsQuerySchema>
export type CompareRow = z.infer<typeof compareRowSchema>
export type CompareSummary = z.infer<typeof compareSummarySchema>
export type ComparePriceListsResponse = z.infer<typeof comparePriceListsResponseSchema>
