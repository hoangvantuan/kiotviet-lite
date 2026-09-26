/**
 * BC-06: đối soát tiền mặt cuối ngày khi cửa hàng không dùng ca. Tiền phải có = tiền đầu ngày +
 * tiền mặt thu - tiền mặt chi trong kỳ (số máy chủ tính); chênh lệch = thực đếm - phải có.
 */
export function reconcileCash(input: {
  openingCash: number
  netCash: number
  countedCash: number | null
}): { expectedCash: number; difference: number | null } {
  const expectedCash = input.openingCash + input.netCash
  return {
    expectedCash,
    difference: input.countedCash === null ? null : input.countedCash - expectedCash,
  }
}

/** Ngày hôm nay theo giờ máy, dạng YYYY-MM-DD. */
export function todayLocal(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
