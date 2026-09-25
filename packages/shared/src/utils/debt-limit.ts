import { formatVndWithSuffix } from './currency.js'

export interface DebtLimitSource {
  debtUnlimited: boolean
  customerDebtLimit: number | null
  groupDebtLimit: number | null
}

/**
 * Hạn mức nợ đang áp cho một khách (ADR-0009), định nghĩa duy nhất cho máy chủ và giao diện.
 * - Cờ không giới hạn: trả null, nghĩa DUY NHẤT của null.
 * - Hạn mức riêng của khách nếu có (kể cả 0), không thì hạn mức nhóm.
 * - Không có cả hai: 0, tức không được nợ cho tới khi chủ hoặc quản lý đặt hạn mức.
 */
export function resolveEffectiveDebtLimit(source: DebtLimitSource): number | null {
  if (source.debtUnlimited) return null
  return source.customerDebtLimit ?? source.groupDebtLimit ?? 0
}

/** Số nợ thêm tối đa còn được ghi; null khi không giới hạn. */
export function remainingDebtAllowance(
  effectiveDebtLimit: number | null,
  currentDebt: number,
): number | null {
  if (effectiveDebtLimit === null) return null
  return Math.max(0, effectiveDebtLimit - currentDebt)
}

/** Nhãn hạn mức hiệu lực cho giao diện và báo cáo: phân biệt "không giới hạn" với "không cho nợ". */
export function formatDebtLimitLabel(effectiveDebtLimit: number | null): string {
  if (effectiveDebtLimit === null) return 'Không giới hạn'
  if (effectiveDebtLimit === 0) return 'Không cho nợ'
  return formatVndWithSuffix(effectiveDebtLimit)
}
