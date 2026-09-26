import { formatVndWithSuffix } from '@/lib/currency'

/** Chênh lệch đóng ca: âm là thiếu tiền, dương là thừa tiền. */
export function differenceLabel(difference: number): string {
  if (difference === 0) return 'Khớp'
  return difference < 0
    ? `Thiếu ${formatVndWithSuffix(-difference)}`
    : `Thừa ${formatVndWithSuffix(difference)}`
}
