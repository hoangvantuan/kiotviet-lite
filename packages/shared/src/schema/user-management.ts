import { z } from 'zod'

import { phoneSchema, userRoleSchema } from './auth.js'

const PIN_REGEX = /^\d{6}$/

export const pinSchema = z
  .string({ required_error: 'Vui lòng nhập mã PIN' })
  .regex(PIN_REGEX, 'Mã PIN phải gồm đúng 6 chữ số')

export const nameSchema = z
  .string({ required_error: 'Vui lòng nhập tên' })
  .trim()
  .min(2, 'Tên tối thiểu 2 ký tự')
  .max(100, 'Tên tối đa 100 ký tự')

// Owner KHÔNG được gán qua API quản lý nhân viên — chủ cửa hàng chỉ sinh ra lúc
// đăng ký cửa hàng. Loại trừ 'owner' ở đây chặn leo thang đặc quyền (tạo owner
// thứ 2 rồi chiếm quyền). userRoleSchema gốc vẫn giữ 'owner' cho login/hiển thị.
export const assignableRoleSchema = z.enum(['manager', 'staff'], {
  errorMap: () => ({ message: 'Vai trò chỉ có thể là quản lý hoặc nhân viên' }),
})

export const createUserSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  role: assignableRoleSchema,
  pin: pinSchema,
})

export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    role: assignableRoleSchema.optional(),
    isActive: z.boolean().optional(),
    pin: pinSchema.optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.role !== undefined ||
      data.isActive !== undefined ||
      data.pin !== undefined,
    { message: 'Cần ít nhất một trường để cập nhật' },
  )

export const verifyPinSchema = z.object({
  pin: pinSchema,
})

export const userListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  role: userRoleSchema,
  isActive: z.boolean(),
  createdAt: z.string(),
})

export type AssignableRole = z.infer<typeof assignableRoleSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type VerifyPinInput = z.infer<typeof verifyPinSchema>
export type UserListItem = z.infer<typeof userListItemSchema>
