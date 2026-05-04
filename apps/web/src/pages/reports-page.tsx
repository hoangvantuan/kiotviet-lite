import { useState } from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DebtAgingReport } from '@/features/reports/components/DebtAgingReport'
import { DebtSummaryReport } from '@/features/reports/components/DebtSummaryReport'

type DatePreset = '7days' | '30days' | '90days' | 'all'

function getDateRange(preset: DatePreset) {
  const to = new Date().toISOString()
  if (preset === 'all') return { to }
  const daysMap: Record<DatePreset, number> = { '7days': 7, '30days': 30, '90days': 90, all: 0 }
  const from = new Date(Date.now() - daysMap[preset] * 86400000).toISOString()
  return { from, to }
}

const PRESET_LABELS: Record<DatePreset, string> = {
  '7days': '7 ngày',
  '30days': '30 ngày',
  '90days': '90 ngày',
  all: 'Tất cả',
}

export function ReportsPage() {
  const [preset, setPreset] = useState<DatePreset>('90days')
  const dateQuery = getDateRange(preset)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Báo cáo công nợ</h1>
          <p className="text-sm text-muted-foreground">Theo dõi tình hình công nợ khách hàng và nhà cung cấp.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Khoảng thời gian:</span>
          <Select value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRESET_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="aging">
        <TabsList>
          <TabsTrigger value="aging">Tuổi nợ</TabsTrigger>
          <TabsTrigger value="summary">Tổng hợp</TabsTrigger>
        </TabsList>
        <TabsContent value="aging" className="mt-4">
          <DebtAgingReport query={dateQuery} />
        </TabsContent>
        <TabsContent value="summary" className="mt-4">
          <DebtSummaryReport query={dateQuery} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
