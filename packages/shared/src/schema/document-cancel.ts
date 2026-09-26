import { z } from 'zod'

import { documentShiftIdSchema, refundMethodSchema } from './cash-management.js'
import { pinSchema } from './user-management.js'

/**
 * TIEN-107: chứng từ (phiếu thu, phiếu chi, phiếu nhập) không bị xóa. 'active' là chứng từ còn hiệu
 * lực, 'cancelled' là đã hủy và mọi bút toán của nó đã được đảo. Đơn bán dùng trạng thái riêng
 * (`orderStatusSchema`, có 'cancelled').
 */
export const documentStatusSchema = z.enum(['active', 'cancelled'])

/**
 * Yêu cầu hủy chứng từ: lý do bắt buộc. Người không có quyền `documents.cancel` phải kèm người
 * duyệt và PIN của người duyệt (R1, ADR-0009).
 */
export const cancelDocumentSchema = z
  .object({
    reason: z
      .string({ required_error: 'Vui lòng nhập lý do hủy' })
      .trim()
      .min(1, 'Vui lòng nhập lý do hủy')
      .max(500, 'Lý do hủy tối đa 500 ký tự'),
    approverId: z.string().uuid('Người duyệt không hợp lệ').optional(),
    approverPin: pinSchema.optional(),
    // BC-06: chứng từ hủy có tiền trả lại (hủy đơn: trả khách; hủy phiếu nhập: NCC hoàn) ghi kênh
    // tiền và ca nhận hay chi tiền. Không gửi thì máy chủ chọn mặc định; chứng từ khác bỏ qua
    refundMethod: refundMethodSchema.optional(),
    shiftId: documentShiftIdSchema,
  })
  .strict()
  .refine((d) => !d.approverPin || !!d.approverId, {
    message: 'Cần chọn người duyệt cho mã PIN',
    path: ['approverId'],
  })

/** Thông tin hủy đính kèm DTO của chứng từ đã hủy */
export const documentCancellationSchema = z.object({
  cancelledAt: z.string(),
  cancelledBy: z.string().uuid().nullable(),
  cancelledByName: z.string().nullable(),
  cancelReason: z.string().nullable(),
})

export type DocumentStatus = z.infer<typeof documentStatusSchema>
export type CancelDocumentInput = z.infer<typeof cancelDocumentSchema>
export type DocumentCancellation = z.infer<typeof documentCancellationSchema>
