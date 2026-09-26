import { REFUND_METHODS, type RefundMethod, refundMethodSchema } from '@kiotviet-lite/shared'

import { MoneyMethodPicker } from '@/components/shared/money-method-picker'

import { DocumentShiftSelect } from './document-shift-select'
import type { useDocumentShiftChoice } from './use-document-shift-choice'

interface RefundMethodFieldsProps {
  /** Ví dụ "Trả lại khách qua", "NCC hoàn tiền qua" */
  label: string
  value: RefundMethod
  onChange: (method: RefundMethod) => void
  shiftChoice: ReturnType<typeof useDocumentShiftChoice>
  disabled?: boolean
  idPrefix: string
}

/**
 * BC-06: chứng từ hủy hoặc trả có tiền trả lại (hủy đơn, hủy phiếu nhập, trả hàng nhập) ghi kênh
 * tiền và ca nhận hay chi khoản đó. Đổi kênh thì bỏ lựa chọn ca cũ: chỉ tiền mặt mới bắt chọn ca.
 */
export function RefundMethodFields({
  label,
  value,
  onChange,
  shiftChoice,
  disabled,
  idPrefix,
}: RefundMethodFieldsProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{label}</p>
        <MoneyMethodPicker
          value={value}
          onChange={(method) => {
            const parsed = refundMethodSchema.safeParse(method)
            if (!parsed.success) return
            if (parsed.data !== value) shiftChoice.reset()
            onChange(parsed.data)
          }}
          disabled={disabled}
          ariaLabel={label}
          idPrefix={`${idPrefix}-method`}
          methods={REFUND_METHODS}
        />
      </div>
      {shiftChoice.choices && (
        <DocumentShiftSelect
          choices={shiftChoice.choices}
          value={shiftChoice.shiftId}
          onChange={shiftChoice.setShiftId}
          disabled={disabled}
          idPrefix={idPrefix}
        />
      )}
    </div>
  )
}
