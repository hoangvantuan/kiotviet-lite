import type { DashboardPeriod } from '@kiotviet-lite/shared'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  today: 'Hôm nay',
  week: 'Tuần',
  month: 'Tháng',
  year: 'Năm',
}

interface DashboardPeriodSelectorProps {
  value: DashboardPeriod
  onChange: (period: DashboardPeriod) => void
}

export function DashboardPeriodSelector({ value, onChange }: DashboardPeriodSelectorProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as DashboardPeriod)}>
      <TabsList>
        {(Object.keys(PERIOD_LABELS) as DashboardPeriod[]).map((period) => (
          <TabsTrigger key={period} value={period}>
            {PERIOD_LABELS[period]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
