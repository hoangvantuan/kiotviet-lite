import { format, startOfMonth, startOfQuarter, subDays } from 'date-fns'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ReportDateRangePickerProps {
  from?: string
  to?: string
  onChange: (from: string | undefined, to: string | undefined) => void
}

const presets = [
  {
    label: 'Hôm nay',
    getRange: () => ({
      from: format(new Date(), 'yyyy-MM-dd'),
      to: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: '7 ngày',
    getRange: () => ({
      from: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
      to: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: '30 ngày',
    getRange: () => ({
      from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
      to: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'Tháng này',
    getRange: () => ({
      from: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
      to: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'Quý này',
    getRange: () => ({
      from: format(startOfQuarter(new Date()), 'yyyy-MM-dd'),
      to: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
]

export function ReportDateRangePicker({ from, to, onChange }: ReportDateRangePickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Input
          type="date"
          value={from ?? ''}
          onChange={(e) => onChange(e.target.value || undefined, to)}
          className="h-8 w-36"
        />
        <span className="text-muted-foreground text-sm">~</span>
        <Input
          type="date"
          value={to ?? ''}
          onChange={(e) => onChange(from, e.target.value || undefined)}
          className="h-8 w-36"
        />
      </div>
      <div className="flex gap-1">
        {presets.map((p) => (
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
