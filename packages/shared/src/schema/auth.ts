import { z } from 'zod'

const VN_PHONE_REGEX = /^(0|\+?84)(3|5|7|8|9)\d{8}$/

export const phoneSchema = z
  .string({ required_error: 'Vui lòng nhập số điện thoại' })
  .trim()
  .regex(VN_PHONE_REGEX, 'Số điện thoại không hợp lệ')

export const passwordSchema = z
  .string({ required_error: 'Vui lòng nhập mật khẩu' })
  .min(8, 'Mật khẩu tối thiểu 8 ký tự')
  .max(72, 'Mật khẩu tối đa 72 ký tự')

export const registerSchema = z.object({
  storeName: z
    .string({ required_error: 'Vui lòng nhập tên cửa hàng' })
    .trim()
    .min(2, 'Tên cửa hàng tối thiểu 2 ký tự')
    .max(100, 'Tên cửa hàng tối đa 100 ký tự'),
  ownerName: z
    .string({ required_error: 'Vui lòng nhập tên chủ cửa hàng' })
    .trim()
    .min(2, 'Tên chủ tối thiểu 2 ký tự')
    .max(100, 'Tên chủ tối đa 100 ký tự'),
  phone: phoneSchema,
  password: passwordSchema,
})

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z
    .string({ required_error: 'Vui lòng nhập mật khẩu' })
    .min(1, 'Vui lòng nhập mật khẩu'),
})

export const userRoleSchema = z.enum(['owner', 'manager', 'staff'])

export const authUserSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  role: userRoleSchema,
})

export const authResponseSchema = z.object({
  user: authUserSchema,
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
})

export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
})

export const accessTokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  storeId: z.string().uuid(),
  role: userRoleSchema,
  type: z.literal('access'),
})

export const refreshTokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  jti: z.string().uuid(),
  type: z.literal('refresh'),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type AuthUser = z.infer<typeof authUserSchema>
export type AuthResponse = z.infer<typeof authResponseSchema>
export type RefreshResponse = z.infer<typeof refreshResponseSchema>
export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>
export type RefreshTokenPayload = z.infer<typeof refreshTokenPayloadSchema>
export type UserRole = z.infer<typeof userRoleSchema>
