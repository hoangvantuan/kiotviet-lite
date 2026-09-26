import { z } from 'zod'

import { hasValidQuantityScale } from '../utils/quantity.js'

/** Giới hạn số lượng của một dòng chứng từ */
export const MAX_LINE_QUANTITY = 1_000_000

/**
 * Số lượng dương tối đa 3 chữ số lẻ (ADR-0015). Có được lẻ hay không tùy cờ của mặt hàng; máy
 * chủ kiểm cờ khi đã nạp mặt hàng, schema chỉ chặn phần hình thức. Máy khách cũ gửi số nguyên
 * vẫn hợp lệ.
 */
export function positiveQuantitySchema(label = 'Số lượng') {
  return z
    .number({ invalid_type_error: `${label} phải là số` })
    .positive(`${label} phải lớn hơn 0`)
    .max(MAX_LINE_QUANTITY, `${label} vượt giới hạn`)
    .refine(hasValidQuantityScale, `${label} tối đa 3 chữ số lẻ`)
}

/** Số lượng không âm tối đa 3 chữ số lẻ (số thực đếm khi kiểm kê, tồn tối thiểu). */
export function nonNegativeQuantitySchema(label = 'Số lượng') {
  return z
    .number({ invalid_type_error: `${label} phải là số` })
    .min(0, `${label} không được âm`)
    .max(MAX_LINE_QUANTITY * 1000, `${label} vượt giới hạn`)
    .refine(hasValidQuantityScale, `${label} tối đa 3 chữ số lẻ`)
}
