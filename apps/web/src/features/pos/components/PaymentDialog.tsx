import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  BookOpen,
  CheckCircle2,
  CreditCard,
  Loader2,
  QrCode,
  Wallet,
} from 'lucide-react'

import { CurrencyInput } from '@/components/shared/currency-input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PinDialog } from '@/features/auth/pin-dialog'
import { formatVndWithSuffix } from '@/lib/currency'
import { cn } from '@/lib/utils'

import { useCustomerDebtQuery } from '../hooks/use-checkout'
import { getDenominations } from '../utils'
import { DebtSummaryCard } from './DebtSummaryCard'

export type PaymentMethod = 'cash' | 'transfer' | 'qr' | 'combined' | 'debt'

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  grandTotal: number
  customerId: string | null
  customerName: string | null
  defaultMethod?: PaymentMethod
  onComplete: (payload: {
    paymentMethod: PaymentMethod
    cashAmount?: number
    transferAmount?: number
    debtAmount?: number
    debtLimitOverridden?: boolean
  }) => void
  isLoading?: boolean
}

interface MethodEntry {
  key: PaymentMethod
  label: string
  icon: React.ElementType
}

const BASE_METHODS: MethodEntry[] = [
  { key: 'cash', label: 'Tiền mặt', icon: Banknote },
  { key: 'transfer', label: 'Chuyển khoản', icon: CreditCard },
  { key: 'qr', label: 'QR Code', icon: QrCode },
  { key: 'combined', label: 'Kết hợp', icon: Wallet },
]

const DEBT_METHOD: MethodEntry = { key: 'debt', label: 'Ghi nợ', icon: BookOpen }

export function PaymentDialog({
  open,
  onOpenChange,
  grandTotal,
  customerId,
  customerName,
  defaultMethod = 'cash',
  onComplete,
  isLoading = false,
}: PaymentDialogProps) {
  const [method, setMethod] = useState<PaymentMethod>(defaultMethod)
  const [cashAmount, setCashAmount] = useState<number | null>(null)
  const [comboCash, setComboCash] = useState<number | null>(null)
  const [comboTransfer, setComboTransfer] = useState<number | null>(null)
  // Story 5.1: debt state
  const [debtCashPrepaid, setDebtCashPrepaid] = useState<number | null>(null)
  const [debtLimitOverridden, setDebtLimitOverridden] = useState(false)
  const [pinDialogOpen, setPinDialogOpen] = useState(false)
  const cashInputRef = useRef<HTMLInputElement>(null)

  // Available methods: thêm Ghi nợ chỉ khi có customer
  const methods: MethodEntry[] = customerId ? [...BASE_METHODS, DEBT_METHOD] : BASE_METHODS

  // Customer debt query: chỉ chạy khi có customerId VÀ method hiện tại là debt (lazy)
  const debtInfoQuery = useCustomerDebtQuery(method === 'debt' ? customerId : null)
  const debtInfo = debtInfoQuery.data ?? null

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      // Nếu defaultMethod là debt nhưng không có customer → fallback sang cash
      const initialMethod = defaultMethod === 'debt' && !customerId ? 'cash' : defaultMethod
      setMethod(initialMethod)
      setCashAmount(null)
      setComboCash(null)
      setComboTransfer(null)
      setDebtCashPrepaid(null)
      setDebtLimitOverridden(false)
      setPinDialogOpen(false)
      const timer = setTimeout(() => cashInputRef.current?.focus(), 100)
      return () => clearTimeout(timer)
    }
  }, [open, defaultMethod, customerId])

  // Reset override khi đổi method khác debt
  useEffect(() => {
    if (method !== 'debt') {
      setDebtLimitOverridden(false)
    }
  }, [method])

  // Auto-focus cash input when switching to cash method
  useEffect(() => {
    if (open && method === 'cash') {
      const timer = setTimeout(() => cashInputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [open, method])

  const denominations = getDenominations(grandTotal)

  // Cash method calculations
  const cashGiven = cashAmount ?? 0
  const cashChange = cashGiven - grandTotal
  const cashSufficient = cashGiven >= grandTotal

  // Combined method calculations
  const comboCashVal = comboCash ?? 0
  const comboTransferVal = comboTransfer ?? 0
  const comboTotal = comboCashVal + comboTransferVal
  const comboChange = comboTotal - grandTotal
  const comboSufficient = comboTotal >= grandTotal

  // Story 5.1: Debt calculations
  const debtCashVal = debtCashPrepaid ?? 0
  // debtAmount = max(0, grandTotal - cash trả trước)
  const debtAmount = Math.max(0, grandTotal - debtCashVal)
  // Tiền thừa khi cash > grandTotal
  const debtCashChange = Math.max(0, debtCashVal - grandTotal)
  // Hạn mức check
  const currentDebt = debtInfo?.currentDebt ?? 0
  const effectiveDebtLimit = debtInfo?.effectiveDebtLimit ?? null
  const hasDebtLimit = effectiveDebtLimit !== null && effectiveDebtLimit > 0
  const exceedsLimit = hasDebtLimit && currentDebt + debtAmount > (effectiveDebtLimit as number)
  const maxAdditional = hasDebtLimit ? Math.max(0, (effectiveDebtLimit as number) - currentDebt) : 0

  function canComplete(): boolean {
    if (isLoading) return false
    switch (method) {
      case 'cash':
        return cashSufficient
      case 'transfer':
      case 'qr':
        return true
      case 'combined':
        return comboSufficient
      case 'debt':
        if (!customerId) return false
        if (debtInfoQuery.isLoading) return false
        // Nếu có debtAmount = 0 (cash trả trước >= grandTotal), không cần check limit
        if (debtAmount === 0) return true
        // Nếu vượt limit và chưa override → chặn
        if (exceedsLimit && !debtLimitOverridden) return false
        return true
    }
  }

  function handleComplete() {
    if (!canComplete()) return
    switch (method) {
      case 'cash':
        onComplete({ paymentMethod: 'cash', cashAmount: cashGiven })
        break
      case 'transfer':
        onComplete({ paymentMethod: 'transfer' })
        break
      case 'qr':
        onComplete({ paymentMethod: 'qr' })
        break
      case 'combined':
        onComplete({
          paymentMethod: 'combined',
          cashAmount: comboCashVal,
          transferAmount: comboTransferVal,
        })
        break
      case 'debt':
        onComplete({
          paymentMethod: 'debt',
          cashAmount: debtCashVal,
          debtAmount,
          debtLimitOverridden,
        })
        break
    }
  }

  function handleOpenPinDialog() {
    setPinDialogOpen(true)
  }

  function handlePinVerified() {
    setDebtLimitOverridden(true)
    setPinDialogOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thanh toán</DialogTitle>
          <DialogDescription className="sr-only">
            Chọn phương thức thanh toán và hoàn thành đơn hàng
          </DialogDescription>
        </DialogHeader>

        {/* Grand total */}
        <div className="rounded-lg bg-muted/50 p-4 text-center">
          <p className="mb-1 text-sm text-muted-foreground">Tổng thanh toán</p>
          <p className="font-mono text-3xl font-bold text-foreground">
            {formatVndWithSuffix(grandTotal)}
          </p>
        </div>

        {/* Payment method tabs */}
        <div className="flex gap-2">
          {methods.map((m) => {
            const Icon = m.icon
            const active = method === m.key
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMethod(m.key)}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-xs font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border text-muted-foreground hover:bg-accent',
                )}
              >
                <Icon className="h-4 w-4" />
                {m.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div className="space-y-4">
          {method === 'cash' && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Tiền khách đưa
                </label>
                <CurrencyInput
                  ref={cashInputRef}
                  value={cashAmount}
                  onChange={setCashAmount}
                  placeholder="0"
                  className="h-11"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {denominations.map((d) => (
                  <Button
                    key={d}
                    type="button"
                    variant={cashAmount === d ? 'secondary' : 'outline'}
                    size="sm"
                    className="min-h-[44px] min-w-[44px] font-mono text-xs"
                    onClick={() => setCashAmount(d)}
                  >
                    {formatVndWithSuffix(d)}
                  </Button>
                ))}
              </div>

              {cashAmount != null && cashAmount > 0 && (
                <div className="text-right">
                  {cashSufficient ? (
                    <p className="text-sm font-semibold text-green-600">
                      Tiền thừa: {formatVndWithSuffix(cashChange)}
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-destructive">
                      Còn thiếu: {formatVndWithSuffix(Math.abs(cashChange))}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {method === 'transfer' && (
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Đã nhận chuyển khoản{' '}
                <span className="font-semibold text-foreground">
                  {formatVndWithSuffix(grandTotal)}
                </span>
              </p>
            </div>
          )}

          {method === 'qr' && (
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Đã nhận thanh toán QR{' '}
                <span className="font-semibold text-foreground">
                  {formatVndWithSuffix(grandTotal)}
                </span>
              </p>
            </div>
          )}

          {method === 'combined' && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Phần tiền mặt
                </label>
                <CurrencyInput
                  value={comboCash}
                  onChange={setComboCash}
                  placeholder="0"
                  className="h-11"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Phần chuyển khoản
                </label>
                <CurrencyInput
                  value={comboTransfer}
                  onChange={setComboTransfer}
                  placeholder="0"
                  className="h-11"
                />
              </div>

              {comboTotal > 0 && (
                <div className="text-right">
                  {comboSufficient ? (
                    <p className="text-sm font-semibold text-green-600">
                      Tiền thừa: {formatVndWithSuffix(comboChange)}
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-destructive">
                      Còn thiếu: {formatVndWithSuffix(Math.abs(comboChange))}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {method === 'debt' && customerId && (
            <>
              {debtInfoQuery.isLoading && (
                <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang tải thông tin công nợ...
                </div>
              )}

              {debtInfoQuery.isError && (
                <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                  Không thể tải thông tin công nợ. Vui lòng thử lại.
                </div>
              )}

              {debtInfo && (
                <>
                  <DebtSummaryCard
                    customerName={debtInfo.customerName ?? customerName ?? ''}
                    currentDebt={currentDebt}
                    effectiveDebtLimit={effectiveDebtLimit}
                    debtAmount={debtAmount}
                  />

                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">
                      Tiền mặt trả trước (tuỳ chọn)
                    </label>
                    <CurrencyInput
                      value={debtCashPrepaid}
                      onChange={setDebtCashPrepaid}
                      placeholder="0"
                      className="h-11"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {denominations.map((d) => (
                      <Button
                        key={d}
                        type="button"
                        variant={debtCashPrepaid === d ? 'secondary' : 'outline'}
                        size="sm"
                        className="min-h-[44px] min-w-[44px] font-mono text-xs"
                        onClick={() => setDebtCashPrepaid(d)}
                      >
                        {formatVndWithSuffix(d)}
                      </Button>
                    ))}
                  </div>

                  {/* Tiền thừa khi cash trả trước > grandTotal */}
                  {debtCashChange > 0 && (
                    <div className="text-right">
                      <p className="text-sm font-semibold text-green-600">
                        Tiền thừa: {formatVndWithSuffix(debtCashChange)}
                      </p>
                    </div>
                  )}

                  {/* Phần ghi nợ */}
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-sm text-muted-foreground">Phần ghi nợ</p>
                    <p className="font-mono text-xl font-bold text-foreground">
                      {formatVndWithSuffix(debtAmount)}
                    </p>
                  </div>

                  {/* Cảnh báo vượt hạn mức */}
                  {exceedsLimit && debtAmount > 0 && !debtLimitOverridden && (
                    <div className="space-y-2 rounded-lg border border-destructive bg-destructive/10 p-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        <div className="space-y-1 text-sm text-destructive">
                          <p className="font-semibold">Vượt hạn mức công nợ</p>
                          <p>Nợ hiện tại: {formatVndWithSuffix(currentDebt)}</p>
                          <p>Hạn mức: {formatVndWithSuffix(effectiveDebtLimit as number)}</p>
                          <p>Nợ thêm tối đa: {formatVndWithSuffix(maxAdditional)}</p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={handleOpenPinDialog}
                      >
                        Nhập PIN để vượt hạn mức
                      </Button>
                    </div>
                  )}

                  {/* Trạng thái đã verify PIN */}
                  {debtLimitOverridden && exceedsLimit && (
                    <div className="flex items-center gap-2 rounded-lg border border-green-500 bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>Đã xác thực PIN, cho phép vượt hạn mức</span>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Complete button */}
        <Button
          type="button"
          disabled={!canComplete()}
          onClick={handleComplete}
          className="h-12 w-full bg-green-600 text-base font-semibold text-white hover:bg-green-700"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Đang xử lý...
            </>
          ) : (
            'Hoàn thành'
          )}
        </Button>
      </DialogContent>

      {/* Story 5.1: PIN dialog cho vượt hạn mức công nợ */}
      <PinDialog
        open={pinDialogOpen}
        onOpenChange={setPinDialogOpen}
        onVerified={handlePinVerified}
        title="Xác thực PIN chủ cửa hàng"
        description="Nhập mã PIN 6 chữ số để vượt hạn mức công nợ."
      />
    </Dialog>
  )
}
