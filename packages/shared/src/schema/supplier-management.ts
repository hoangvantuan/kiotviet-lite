import { z } from 'zod'

const NAME_REGEX = /^[\p{L}\p{N}\s\-_&()'./,]+$/u
const PHONE_REGEX = /^\+?[0-9]+$/
const TAX_ID_REGEX = /^[A-Za-z0-9-]+$/

export const supplierNameSchema = z
  .string({ required_error: 'Vui lòng nhập tên nhà cung cấp' })
  .trim()
  .min(1, 'Vui lòng nhập tên nhà cung cấp')
  .max(100, 'Tên nhà cung cấp tối đa 100 ký tự')
  .regex(NAME_REGEX, 'Tên nhà cung cấp chứa ký tự không hợp lệ')

export const supplierPhoneSchema = z
  .string()
  .trim()
  .min(8, 'Số điện thoại tối thiểu 8 ký tự')
  .max(15, 'Số điện thoại tối đa 15 ký tự')
  .regex(PHONE_REGEX, 'Số điện thoại chỉ chứa chữ số và dấu +')

export const supplierEmailSchema = z
  .string()
  .trim()
  .max(255, 'Email tối đa 255 ký tự')
  .email('Email không hợp lệ')

export const supplierTaxIdSchema = z
  .string()
  .trim()
  .max(32, 'Mã số thuế tối đa 32 ký tự')
  .regex(TAX_ID_REGEX, 'Mã số thuế chỉ chứa chữ, số và dấu gạch ngang')

export const supplierHasDebtSchema = z.enum(['yes', 'no', 'all'])

export const createSupplierSchema = z.object({
  name: supplierNameSchema,
  phone: supplierPhoneSchema.nullable().optional(),
  email: supplierEmailSchema.nullable().optional(),
  address: z.string().trim().max(500, 'Địa chỉ tối đa 500 ký tự').nullable().optional(),
  taxId: supplierTaxIdSchema.nullable().optional(),
  notes: z.string().trim().max(1000, 'Ghi chú tối đa 1000 ký tự').nullable().optional(),
})

export const updateSupplierSchema = z
  .object({
    name: supplierNameSchema.optional(),
    phone: supplierPhoneSchema.nullable().optional(),
    email: supplierEmailSchema.nullable().optional(),
    address: z.string().trim().max(500, 'Địa chỉ tối đa 500 ký tự').nullable().optional(),
    taxId: supplierTaxIdSchema.nullable().optional(),
    notes: z.string().trim().max(1000, 'Ghi chú tối đa 1000 ký tự').nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Cần ít nhất một trường để cập nhật',
  })

export const listSuppliersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  hasDebt: supplierHasDebtSchema.default('all'),
})

export const listTrashedSuppliersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export const supplierListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  taxId: z.string().nullable(),
  notes: z.string().nullable(),
  currentDebt: z.number(),
  purchaseCount: z.number().int(),
  totalPurchased: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const supplierDetailSchema = supplierListItemSchema.extend({
  storeId: z.string().uuid(),
  deletedAt: z.string().nullable(),
})

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>
export type ListTrashedSuppliersQuery = z.infer<typeof listTrashedSuppliersQuerySchema>
export type SupplierListItem = z.infer<typeof supplierListItemSchema>
export type SupplierDetail = z.infer<typeof supplierDetailSchema>
export type SupplierHasDebt = z.infer<typeof supplierHasDebtSchema>
