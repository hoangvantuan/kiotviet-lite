import { z } from 'zod'

const NAME_REGEX = /^[\p{L}\p{N}\s\-_&()'./,]+$/u
const SKU_REGEX = /^[A-Za-z0-9_\-./]+$/
const BARCODE_REGEX = /^[A-Za-z0-9]+$/

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

export const productDetailSchema = productListItemSchema.extend({
  storeId: z.string().uuid(),
  deletedAt: z.string().nullable(),
})

export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>
export type ProductListItem = z.infer<typeof productListItemSchema>
export type ProductDetail = z.infer<typeof productDetailSchema>
export type StockFilter = z.infer<typeof stockFilterSchema>
