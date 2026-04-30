import { useEffect, useRef, useState } from 'react'
import { Banknote, CreditCard, Loader2, QrCode, Wallet } from 'lucide-react'

import { CurrencyInput } from '@/components/shared/currency-input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatVndWithSuffix } from '@/lib/currency'
import { cn } from '@/lib/utils'

import { getDenominations } from '../utils'

type PaymentMethod = 'cash' | 'transfer' | 'qr' | 'combined'

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  grandTotal: number
  onComplete: (payload: {
    paymentMethod: PaymentMethod
    cashAmount?: number
    transferAmount?: number
  }) => void
  isLoading?: boolean
}

const METHODS: { key: PaymentMethod; label: string; icon: React.ElementType }[] = [
  { key: 'cash', label: 'Tien mat', icon: Banknote },
  { key: 'transfer', label: 'Chuyen khoan', icon: CreditCard },
  { key: 'qr', label: 'QR Code', icon: QrCode },
  { key: 'combined', label: 'Ket hop', icon: Wallet },
]

export function PaymentDialog({
  open,
  onOpenChange,
  grandTotal,
  onComplete,
  isLoading = false,
}: PaymentDialogProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [cashAmount, setCashAmount] = useState<number | null>(null)
  const [comboCash, setComboCash] = useState<number | null>(null)
  const [comboTransfer, setComboTransfer] = useState<number | null>(null)
  const cashInputRef = useRef<HTMLInputElement>(null)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setMethod('cash')
      setCashAmount(null)
      setComboCash(null)
      setComboTransfer(null)
      const timer = setTimeout(() => cashInputRef.current?.focus(), 100)
      return () => clearTimeout(timer)
    }
  }, [open])

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
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thanh toan</DialogTitle>
          <DialogDescription className="sr-only">
            Chon phuong thuc thanh toan va hoan thanh don hang
          </DialogDescription>
        </DialogHeader>

        {/* Grand total */}
        <div className="rounded-lg bg-muted/50 p-4 text-center">
          <p className="mb-1 text-sm text-muted-foreground">Tong thanh toan</p>
          <p className="font-mono text-3xl font-bold text-foreground">
            {formatVndWithSuffix(grandTotal)}
          </p>
        </div>

        {/* Payment method tabs */}
        <div className="flex gap-2">
          {METHODS.map((m) => {
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
                  Tien khach dua
                </label>
                <CurrencyInput
                  ref={cashInputRef}
                  value={cashAmount}
                  onChange={setCashAmount}
                  placeholder="0"
                  className="h-11"
                />
              </div>

              {/* Denomination buttons */}
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

              {/* Change display */}
              {cashAmount != null && cashAmount > 0 && (
                <div className="text-right">
                  {cashSufficient ? (
                    <p className="text-sm font-semibold text-green-600">
                      Tien thua: {formatVndWithSuffix(cashChange)}
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-destructive">
                      Con thieu: {formatVndWithSuffix(Math.abs(cashChange))}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {method === 'transfer' && (
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Da nhan chuyen khoan{' '}
                <span className="font-semibold text-foreground">
                  {formatVndWithSuffix(grandTotal)}
                </span>
              </p>
            </div>
          )}

          {method === 'qr' && (
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Da nhan thanh toan QR{' '}
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
                  Phan tien mat
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
                  Phan chuyen khoan
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
                      Tien thua: {formatVndWithSuffix(comboChange)}
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-destructive">
                      Con thieu: {formatVndWithSuffix(Math.abs(comboChange))}
                    </p>
                  )}
                </div>
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
              Dang xu ly...
            </>
          ) : (
            'Hoan thanh'
          )}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
