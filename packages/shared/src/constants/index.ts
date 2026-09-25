export * from './dev-seed.js'
export * from './permissions.js'
export * from './pricing.js'
export * from './regex.js'

export const APP_NAME = 'KiotViet Lite'
export * from './pagination.js'

/**
 * POS-10: `details.reason` của lỗi 401 khi nhập sai PIN. Máy khách thấy lý do này thì không làm mới
 * phiên rồi gửi lại request (gửi lại làm một lần nhập sai bị tính hai lần).
 */
export const PIN_INVALID_REASON = 'pin_invalid'
