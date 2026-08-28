import { useStoreQuery } from '@/features/settings/use-store-settings'
import { formatVndWithSuffix } from '@/lib/currency'
import { cn } from '@/lib/utils'

interface DebtSummaryCardProps {
  customerName: string
  currentDebt: number
  effectiveDebtLimit: number | null
  debtAmount: number
  warningPercent?: number
}

function getProgressColor(usage: number, warnPercent: number): string {
  if (usage >= 100) return 'bg-red-500'
  if (usage >= warnPercent) return 'bg-yellow-500'
  return 'bg-green-500'
}

export function DebtSummaryCard({
  customerName,
  currentDebt,
  effectiveDebtLimit,
  debtAmount,
  warningPercent: propWarningPercent,
}: DebtSummaryCardProps) {
  const storeQuery = useStoreQuery()
  const warningPercent = propWarningPercent ?? storeQuery.data?.debtWarningPercent ?? 80

  const debtAfter = currentDebt + debtAmount
  // null hoặc 0 đều là không giới hạn
  const hasLimit = effectiveDebtLimit !== null && effectiveDebtLimit > 0
  const usage = hasLimit ? (debtAfter / (effectiveDebtLimit as number)) * 100 : 0
  const usageRounded = Math.round(usage)
  const progressColor = getProgressColor(usage, warningPercent)

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="font-medium text-foreground">{customerName}</p>

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Nợ hiện tại</span>
        <span className="font-mono text-foreground">{formatVndWithSuffix(currentDebt)}</span>
      </div>

      <div className="flex justify-between text-sm font-semibold">
        <span className="text-muted-foreground">Nợ sau giao dịch</span>
        <span className="font-mono text-foreground">{formatVndWithSuffix(debtAfter)}</span>
      </div>

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Hạn mức</span>
        <span className="font-mono text-foreground">
          {hasLimit ? formatVndWithSuffix(effectiveDebtLimit as number) : 'Không giới hạn'}
        </span>
      </div>

      {hasLimit && (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full transition-all', progressColor)}
              style={{ width: `${Math.min(100, usage)}%` }}
              aria-label={`Đã dùng ${usageRounded}% hạn mức`}
            />
          </div>
          <p className="text-right text-xs text-muted-foreground">
            Đã dùng {usageRounded}% hạn mức
          </p>
        </div>
      )}
    </div>
  )
}
