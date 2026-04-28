import { z } from 'zod'

import { unitConversionInputSchema, unitConversionItemSchema } from './unit-conversions.js'

const NAME_REGEX = /^[\p{L}\p{N}\s\-_&()'./,]+$/u
const SKU_REGEX = /^[A-Za-z0-9_\-./]+$/
const BARCODE_REGEX = /^[A-Za-z0-9]+$/
const ATTR_NAME_REGEX = /^[\p{L}\p{N}\s\-_/]+$/u
const ATTR_VALUE_REGEX = /^[\p{L}\p{N}\s\-_/.]+$/u

export const productStatusSchema = z.enum(['active', 'inactive'])
export type ProductStatus = z.infer<typeof productStatusSchema>

export const productNameSchema = z
  .string({ required_error: 'Vui lòng nhập tên sản phẩm' })
  .trim()
  .min(1, 'Vui lòng nhập tên sản phẩm')
  .max(255, 'Tên sản phẩm tối đa 255 ký tự')
  .regex(NAME_REGEX, 'Tên sản phẩm chứa ký tự không hợp lệ')

export const productSkuSchema = z
  .string()
  .trim()
  .min(1, 'Mã SKU không được trống')
  .max(64, 'SKU tối đa 64 ký tự')
  .regex(SKU_REGEX, 'SKU chỉ chấp nhận chữ, số và - _ . /')

export const productBarcodeSchema = z
  .string()
  .trim()
  .min(1, 'Barcode không được trống')
  .max(64, 'Barcode tối đa 64 ký tự')
  .regex(BARCODE_REGEX, 'Barcode chỉ chấp nhận chữ và số')

export const variantInputSchema = z.object({
  id: z.string().uuid().optional(),
  sku: productSkuSchema,
  barcode: productBarcodeSchema.nullable().optional(),
  attribute1Value: z
    .string()
    .trim()
    .min(1, 'Giá trị thuộc tính không được trống')
    .max(50, 'Giá trị tối đa 50 ký tự')
    .regex(ATTR_VALUE_REGEX, 'Giá trị thuộc tính chứa ký tự không hợp lệ'),
  attribute2Value: z
    .string()
    .trim()
    .min(1, 'Giá trị thuộc tính không được trống')
    .max(50, 'Giá trị tối đa 50 ký tự')
    .regex(ATTR_VALUE_REGEX, 'Giá trị thuộc tính chứa ký tự không hợp lệ')
    .nullable()
    .optional(),
  sellingPrice: z.number().int('Giá phải là số nguyên').min(0, 'Giá ≥ 0'),
  costPrice: z
    .number()
    .int('Giá vốn phải là số nguyên')
    .min(0, 'Giá vốn ≥ 0')
    .nullable()
    .optional(),
  stockQuantity: z.number().int('Tồn kho phải là số nguyên').min(0, 'Tồn kho ≥ 0').default(0),
  status: productStatusSchema.default('active'),
})

export const variantUpdateInputSchema = variantInputSchema.omit({ stockQuantity: true }).strict({
  message: 'Trường stockQuantity không được phép trong update biến thể',
})

function buildVariantsConfigRefine<
  T extends {
    attribute1Name: string
    attribute2Name?: string | null
    variants: Array<{
      sku: string
      barcode?: string | null
      attribute1Value: string
      attribute2Value?: string | null
    }>
  },
>(data: T, ctx: z.RefinementCtx) {
  const has2 = data.attribute2Name !== null && data.attribute2Name !== undefined
  data.variants.forEach((v, i) => {
    if (has2 && (v.attribute2Value === null || v.attribute2Value === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants', i, 'attribute2Value'],
        message: 'Bắt buộc khi có thuộc tính 2',
      })
    }
    if (!has2 && v.attribute2Value !== null && v.attribute2Value !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants', i, 'attribute2Value'],
        message: 'Phải null khi không có thuộc tính 2',
      })
    }
  })

  if (
    has2 &&
    data.attribute2Name &&
    data.attribute2Name.toLowerCase() === data.attribute1Name.toLowerCase()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['attribute2Name'],
      message: 'Hai thuộc tính không được trùng tên',
    })
  }

  const combos = new Set<string>()
  data.variants.forEach((v, i) => {
    const key =
      `${v.attribute1Value.toLowerCase()}::` + `${(v.attribute2Value ?? '').toLowerCase()}`
    if (combos.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants', i],
        message: 'Tổ hợp giá trị thuộc tính bị trùng',
      })
    }
    combos.add(key)
  })

  const skus = new Set<string>()
  data.variants.forEach((v, i) => {
    const k = v.sku.toLowerCase()
    if (skus.has(k)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants', i, 'sku'],
        message: 'SKU biến thể bị trùng',
      })
    }
    skus.add(k)
  })

  const barcodes = new Set<string>()
  data.variants.forEach((v, i) => {
    if (v.barcode) {
      if (barcodes.has(v.barcode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants', i, 'barcode'],
          message: 'Barcode biến thể bị trùng',
        })
      }
      barcodes.add(v.barcode)
    }
  })
}

export const variantsConfigSchema = z
  .object({
    attribute1Name: z
      .string()
      .trim()
      .min(1, 'Tên thuộc tính không được trống')
      .max(50, 'Tên thuộc tính tối đa 50 ký tự')
      .regex(ATTR_NAME_REGEX, 'Tên thuộc tính chứa ký tự không hợp lệ'),
    attribute2Name: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .regex(ATTR_NAME_REGEX, 'Tên thuộc tính chứa ký tự không hợp lệ')
      .nullable()
      .optional(),
    variants: z
      .array(variantInputSchema)
      .min(1, 'Cần ít nhất 1 biến thể')
      .max(100, 'Tổng số biến thể vượt giới hạn 100'),
  })
  .superRefine(buildVariantsConfigRefine)

export const variantsConfigUpdateSchema = z
  .object({
    attribute1Name: z
      .string()
      .trim()
      .min(1, 'Tên thuộc tính không được trống')
      .max(50, 'Tên thuộc tính tối đa 50 ký tự')
      .regex(ATTR_NAME_REGEX, 'Tên thuộc tính chứa ký tự không hợp lệ'),
    attribute2Name: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .regex(ATTR_NAME_REGEX, 'Tên thuộc tính chứa ký tự không hợp lệ')
      .nullable()
      .optional(),
    variants: z
      .array(variantUpdateInputSchema)
      .min(1, 'Cần ít nhất 1 biến thể')
      .max(100, 'Tổng số biến thể vượt giới hạn 100'),
  })
  .superRefine(buildVariantsConfigRefine)

export const createProductSchema = z.object({
  name: productNameSchema,
  sku: productSkuSchema.optional(),
  barcode: productBarcodeSchema.nullable().optional(),
  categoryId: z.string().uuid('Danh mục không hợp lệ').nullable().optional(),
  sellingPrice: z.number().int('Giá phải là số nguyên').min(0, 'Giá ≥ 0'),
  costPrice: z
    .number()
    .int('Giá vốn phải là số nguyên')
    .min(0, 'Giá vốn ≥ 0')
    .nullable()
    .optional(),
  unit: z
    .string()
    .trim()
    .min(1, 'Đơn vị không được trống')
    .max(32, 'Đơn vị tối đa 32 ký tự')
    .default('Cái'),
  imageUrl: z.string().url('URL ảnh không hợp lệ').nullable().optional(),
  status: productStatusSchema.default('active'),
  trackInventory: z.boolean().default(false),
  minStock: z
    .number()
    .int('Định mức tối thiểu phải là số nguyên')
    .min(0, 'Định mức ≥ 0')
    .default(0),
  initialStock: z
    .number()
    .int('Tồn kho ban đầu phải là số nguyên')
    .min(0, 'Tồn kho ≥ 0')
    .default(0),
  variantsConfig: variantsConfigSchema.nullable().optional(),
  unitConversions: z.array(unitConversionInputSchema).max(3, 'Tối đa 3 đơn vị quy đổi').optional(),
})

export const updateProductSchema = z
  .object({
    name: productNameSchema.optional(),
    sku: productSkuSchema.optional(),
    barcode: productBarcodeSchema.nullable().optional(),
    categoryId: z.string().uuid('Danh mục không hợp lệ').nullable().optional(),
    sellingPrice: z.number().int().min(0).optional(),
    costPrice: z.number().int().min(0).nullable().optional(),
    unit: z.string().trim().min(1).max(32).optional(),
    imageUrl: z.string().url('URL ảnh không hợp lệ').nullable().optional(),
    status: productStatusSchema.optional(),
    trackInventory: z.boolean().optional(),
    minStock: z.number().int().min(0).optional(),
    variantsConfig: variantsConfigUpdateSchema.nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Cần ít nhất một trường để cập nhật',
  })

export const stockFilterSchema = z.enum(['in_stock', 'out_of_stock', 'below_min'])

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  categoryId: z.union([z.string().uuid(), z.literal('none')]).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
  stockFilter: stockFilterSchema.optional(),
})

export const productListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  sku: z.string(),
  barcode: z.string().nullable(),
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  sellingPrice: z.number(),
  costPrice: z.number().nullable(),
  unit: z.string(),
  imageUrl: z.string().nullable(),
  status: productStatusSchema,
  trackInventory: z.boolean(),
  currentStock: z.number(),
  minStock: z.number(),
  hasVariants: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const variantItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  sku: z.string(),
  barcode: z.string().nullable(),
  attribute1Name: z.string(),
  attribute1Value: z.string(),
  attribute2Name: z.string().nullable(),
  attribute2Value: z.string().nullable(),
  sellingPrice: z.number(),
  costPrice: z.number().nullable(),
  stockQuantity: z.number(),
  status: productStatusSchema,
  hasTransactions: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const variantsConfigResponseSchema = z.object({
  attribute1Name: z.string(),
  attribute2Name: z.string().nullable(),
  variants: z.array(variantItemSchema),
})

export const productDetailSchema = productListItemSchema.extend({
  storeId: z.string().uuid(),
  deletedAt: z.string().nullable(),
  variantsConfig: variantsConfigResponseSchema.nullable(),
  unitConversions: z.array(unitConversionItemSchema).default([]),
})

export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>
export type ProductListItem = z.infer<typeof productListItemSchema>
export type ProductDetail = z.infer<typeof productDetailSchema>
export type StockFilter = z.infer<typeof stockFilterSchema>
export type VariantInput = z.infer<typeof variantInputSchema>
export type VariantUpdateInput = z.infer<typeof variantUpdateInputSchema>
export type VariantsConfig = z.infer<typeof variantsConfigSchema>
export type VariantsConfigUpdate = z.infer<typeof variantsConfigUpdateSchema>
export type VariantItem = z.infer<typeof variantItemSchema>
export type VariantsConfigResponse = z.infer<typeof variantsConfigResponseSchema>
