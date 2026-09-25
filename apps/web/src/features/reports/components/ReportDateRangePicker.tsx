import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { REPORT_DATE_PRESETS } from '../date-presets'

interface ReportDateRangePickerProps {
  from?: string
  to?: string
  onChange: (from: string | undefined, to: string | undefined) => void
}

export function ReportDateRangePicker({ from, to, onChange }: ReportDateRangePickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Input
          aria-label="Từ ngày"
          type="date"
          value={from ?? ''}
          onChange={(e) => onChange(e.target.value || undefined, to)}
          className="h-8 w-36"
        />
        <span className="text-muted-foreground text-sm">~</span>
        <Input
          aria-label="Đến ngày"
          type="date"
          value={to ?? ''}
          onChange={(e) => onChange(from, e.target.value || undefined)}
          className="h-8 w-36"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {REPORT_DATE_PRESETS.map((p) => (
          <Button
            key={p.label}
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              const range = p.getRange()
              onChange(range.from, range.to)
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
