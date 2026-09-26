import { z } from 'zod'

import { phoneSchema } from './auth.js'

const LOGO_DATA_URL_REGEX = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/

const DEBT_OVERDUE_DAYS_REGEX = /^\d{1,3}(,\d{1,3}){0,4}$/

const BANK_BIN_REGEX = /^\d{6}$/
const BANK_ACCOUNT_REGEX = /^\d{6,19}$/

export const updateStoreSchema = z
  .object({
    name: z
      .string({ required_error: 'Vui lòng nhập tên cửa hàng' })
      .trim()
      .min(2, 'Tên cửa hàng tối thiểu 2 ký tự')
      .max(100, 'Tên cửa hàng tối đa 100 ký tự')
      .optional(),
    address: z.string().trim().max(200, 'Địa chỉ tối đa 200 ký tự').optional().nullable(),
    phone: phoneSchema.optional().nullable(),
    logoUrl: z
      .string()
      .max(2_800_000, 'Logo vượt quá 2MB')
      .regex(LOGO_DATA_URL_REGEX, 'Logo phải là PNG hoặc JPEG (data URL)')
      .optional()
      .nullable(),
    debtWarningPercent: z
      .number()
      .int('Ngưỡng cảnh báo phải là số nguyên')
      .min(1, 'Ngưỡng cảnh báo tối thiểu 1%')
      .max(100, 'Ngưỡng cảnh báo tối đa 100%')
      .optional(),
    debtOverdueDays: z
      .string()
      .regex(DEBT_OVERDUE_DAYS_REGEX, 'Sai định dạng mốc quá hạn (VD: 30,60,90)')
      .optional(),
    negativeStockAlertsEnabled: z.boolean().optional(),
    // POS-06: bật ca bán hàng thì POS yêu cầu mở ca trước khi bán
    shiftsEnabled: z.boolean().optional(),
    // POS-07: tài khoản nhận chuyển khoản cho mã VietQR
    bankBin: z
      .string()
      .trim()
      .regex(BANK_BIN_REGEX, 'Mã ngân hàng (BIN) gồm 6 chữ số')
      .optional()
      .nullable(),
    bankAccountNumber: z
      .string()
      .trim()
      .regex(BANK_ACCOUNT_REGEX, 'Số tài khoản chỉ gồm chữ số, từ 6 tới 19 ký tự')
      .optional()
      .nullable(),
    bankAccountName: z
      .string()
      .trim()
      .max(50, 'Tên chủ tài khoản tối đa 50 ký tự')
      .optional()
      .nullable(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.address !== undefined ||
      data.phone !== undefined ||
      data.logoUrl !== undefined ||
      data.debtWarningPercent !== undefined ||
      data.debtOverdueDays !== undefined ||
      data.negativeStockAlertsEnabled !== undefined ||
      data.shiftsEnabled !== undefined ||
      data.bankBin !== undefined ||
      data.bankAccountNumber !== undefined ||
      data.bankAccountName !== undefined,
    { message: 'Cần ít nhất một trường để cập nhật' },
  )

export const storeSettingsSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  logoUrl: z.string().nullable(),
  debtWarningPercent: z.number().int(),
  debtOverdueDays: z.string(),
  negativeStockAlertsEnabled: z.boolean(),
  shiftsEnabled: z.boolean(),
  bankBin: z.string().nullable(),
  bankAccountNumber: z.string().nullable(),
  bankAccountName: z.string().nullable(),
  updatedAt: z.string(),
})

export type UpdateStoreInput = z.infer<typeof updateStoreSchema>
export type StoreSettings = z.infer<typeof storeSettingsSchema>
