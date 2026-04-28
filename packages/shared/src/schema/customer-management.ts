import { z } from 'zod'

const NAME_REGEX = /^[\p{L}\p{N}\s\-_&()'./,]+$/u
const GROUP_NAME_REGEX = /^[\p{L}\p{N}\s\-_&()'./]+$/u
const PHONE_REGEX = /^[0-9+]+$/
const TAX_ID_REGEX = /^[A-Za-z0-9-]+$/

export const customerNameSchema = z
  .string({ required_error: 'Vui lòng nhập tên khách hàng' })
  .trim()
  .min(1, 'Vui lòng nhập tên khách hàng')
  .max(100, 'Tên khách hàng tối đa 100 ký tự')
  .regex(NAME_REGEX, 'Tên khách hàng chứa ký tự không hợp lệ')

export const customerPhoneSchema = z
  .string({ required_error: 'Vui lòng nhập số điện thoại' })
  .trim()
  .min(8, 'Số điện thoại tối thiểu 8 ký tự')
  .max(15, 'Số điện thoại tối đa 15 ký tự')
  .regex(PHONE_REGEX, 'Số điện thoại chỉ chứa chữ số và dấu +')

export const customerEmailSchema = z
  .string()
  .trim()
  .max(255, 'Email tối đa 255 ký tự')
  .email('Email không hợp lệ')

export const customerTaxIdSchema = z
  .string()
  .trim()
  .max(32, 'Mã số thuế tối đa 32 ký tự')
  .regex(TAX_ID_REGEX, 'Mã số thuế chỉ chứa chữ, số và dấu gạch ngang')

export const customerGroupNameSchema = z
  .string({ required_error: 'Vui lòng nhập tên nhóm' })
  .trim()
  .min(1, 'Vui lòng nhập tên nhóm')
  .max(100, 'Tên nhóm tối đa 100 ký tự')
  .regex(GROUP_NAME_REGEX, 'Tên nhóm chứa ký tự không hợp lệ')

export const debtLimitSchema = z
  .number()
  .int('Hạn mức nợ phải là số nguyên')
  .min(0, 'Hạn mức nợ phải ≥ 0')
  .max(9_999_999_999_999, 'Hạn mức nợ vượt giới hạn')

// ========== Customer Groups ==========

export const createCustomerGroupSchema = z.object({
  name: customerGroupNameSchema,
  description: z.string().trim().max(255, 'Mô tả tối đa 255 ký tự').nullable().optional(),
  defaultPriceListId: z.string().uuid('Bảng giá không hợp lệ').nullable().optional(),
  debtLimit: debtLimitSchema.nullable().optional(),
})

export const updateCustomerGroupSchema = z
  .object({
    name: customerGroupNameSchema.optional(),
    description: z.string().trim().max(255, 'Mô tả tối đa 255 ký tự').nullable().optional(),
    defaultPriceListId: z.string().uuid('Bảng giá không hợp lệ').nullable().optional(),
    debtLimit: debtLimitSchema.nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Cần ít nhất một trường để cập nhật',
  })

export const customerGroupItemSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  defaultPriceListId: z.string().uuid().nullable(),
  debtLimit: z.number().nullable(),
  customerCount: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// ========== Customers ==========

export const createCustomerSchema = z.object({
  name: customerNameSchema,
  phone: customerPhoneSchema,
  email: customerEmailSchema.nullable().optional(),
  address: z.string().trim().max(500, 'Địa chỉ tối đa 500 ký tự').nullable().optional(),
  taxId: customerTaxIdSchema.nullable().optional(),
  notes: z.string().trim().max(1000, 'Ghi chú tối đa 1000 ký tự').nullable().optional(),
  debtLimit: debtLimitSchema.nullable().optional(),
  groupId: z.string().uuid('Nhóm khách hàng không hợp lệ').nullable().optional(),
})

export const updateCustomerSchema = z
  .object({
    name: customerNameSchema.optional(),
    phone: customerPhoneSchema.optional(),
    email: customerEmailSchema.nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    taxId: customerTaxIdSchema.nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    debtLimit: debtLimitSchema.nullable().optional(),
    groupId: z.string().uuid('Nhóm khách hàng không hợp lệ').nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Cần ít nhất một trường để cập nhật',
  })

export const quickCreateCustomerSchema = z.object({
  name: customerNameSchema,
  phone: customerPhoneSchema,
})

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  groupId: z.union([z.string().uuid(), z.literal('none')]).optional(),
  hasDebt: z.enum(['yes', 'no', 'all']).default('all'),
})

export const customerListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  taxId: z.string().nullable(),
  notes: z.string().nullable(),
  debtLimit: z.number().nullable(),
  effectiveDebtLimit: z.number().nullable(),
  groupId: z.string().uuid().nullable(),
  groupName: z.string().nullable(),
  totalPurchased: z.number(),
  purchaseCount: z.number(),
  currentDebt: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const customerDetailSchema = customerListItemSchema.extend({
  storeId: z.string().uuid(),
  effectivePriceListId: z.string().uuid().nullable(),
  group: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      defaultPriceListId: z.string().uuid().nullable(),
      debtLimit: z.number().nullable(),
    })
    .nullable(),
})

export type CreateCustomerGroupInput = z.infer<typeof createCustomerGroupSchema>
export type UpdateCustomerGroupInput = z.infer<typeof updateCustomerGroupSchema>
export type CustomerGroupItem = z.infer<typeof customerGroupItemSchema>
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>
export type QuickCreateCustomerInput = z.infer<typeof quickCreateCustomerSchema>
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>
export type CustomerListItem = z.infer<typeof customerListItemSchema>
export type CustomerDetail = z.infer<typeof customerDetailSchema>
