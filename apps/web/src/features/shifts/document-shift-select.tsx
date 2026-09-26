import type { OpenShiftChoice } from '@kiotviet-lite/shared'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDateTime } from '@/lib/date'

/** Ô chọn ca khi máy chủ báo có nhiều ca đang mở (xem useDocumentShiftChoice). */
interface DocumentShiftSelectProps {
  choices: OpenShiftChoice[]
  value: string | null
  onChange: (shiftId: string) => void
  disabled?: boolean
  idPrefix: string
}

export function DocumentShiftSelect({
  choices,
  value,
  onChange,
  disabled,
  idPrefix,
}: DocumentShiftSelectProps) {
  const id = `${idPrefix}-shift`
  return (
    <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50 p-3">
      <Label htmlFor={id} className="text-amber-900">
        Có nhiều ca đang mở. Chọn ca nhận khoản tiền mặt này
      </Label>
      <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} aria-label="Ca bán hàng" className="bg-background">
          <SelectValue placeholder="Chọn ca" />
        </SelectTrigger>
        <SelectContent>
          {choices.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.userName ?? 'Nhân viên'} (mở lúc {formatDateTime(s.openedAt)})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
