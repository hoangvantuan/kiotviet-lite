import { type SyntheticEvent, useState } from 'react'

import { createSupplierDebtAdjustmentSchema, type SupplierListItem } from '@kiotviet-lite/shared'

import { CurrencyInput } from '@/components/shared/currency-input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { OpeningDebtDialog } from '@/features/customers/components/OpeningDebtDialog'
import { ApiClientError } from '@/lib/api-client'
import { formatVndWithSuffix } from '@/lib/currency'
import { formatDate } from '@/lib/date'
import { showSuccess } from '@/lib/toast'
import { useAuthStore } from '@/stores/use-auth-store'

import {
  useCreateSupplierDebtAdjustmentMutation,
  useSupplierDebtAdjustments,
  useSupplierQuery,
} from './use-suppliers'

export function SupplierDebtPanel({
  target,
  onClose,
}: {
  target: SupplierListItem | null
  onClose: () => void
}) {
  const supplier = useSupplierQuery(target?.id)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [openingOpen, setOpeningOpen] = useState(false)
  const [page, setPage] = useState(1)
  const history = useSupplierDebtAdjustments(target?.id, page)
  const isOwner = useAuthStore((state) => state.user?.role === 'owner')
  const currentDebt = supplier.data?.currentDebt ?? target?.currentDebt ?? 0

  return (
    <>
      <Sheet
        open={!!target}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Công nợ nhà cung cấp</SheetTitle>
            <SheetDescription>{target?.name}</SheetDescription>
          </SheetHeader>
          {target && (
            <div className="mt-6 space-y-6">
              <div>
                <p className="text-sm text-muted-foreground">Công nợ hiện tại</p>
                <p className="text-2xl font-semibold">{formatVndWithSuffix(currentDebt)}</p>
                {isOwner && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setAdjustOpen(true)}>
                      Điều chỉnh nợ
                    </Button>
                    {currentDebt === 0 && (
                      <Button variant="outline" onClick={() => setOpeningOpen(true)}>
                        Nạp nợ đầu kỳ
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <h3 className="font-medium">Lịch sử điều chỉnh nợ</h3>
                {history.isLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
                {history.isError && (
                  <p role="alert" className="text-sm text-destructive">
                    Không tải được lịch sử điều chỉnh.
                  </p>
                )}
                {history.data?.data.length === 0 && (
                  <p className="text-sm text-muted-foreground">Chưa có điều chỉnh nợ.</p>
                )}
                {history.data?.data.map((item) => (
                  <div key={item.id} className="rounded-md border p-3 text-sm">
                    <p className="font-medium">
                      {item.type === 'opening' ? 'Nợ đầu kỳ' : 'Điều chỉnh nợ'} ·{' '}
                      {formatDate(item.createdAt)}
                    </p>
                    <p>
                      {formatVndWithSuffix(item.oldAmount)} → {formatVndWithSuffix(item.newAmount)}
                    </p>
                    <p className="text-muted-foreground">{item.reason}</p>
                    {item.incurredAt && (
                      <p className="text-muted-foreground">
                        Ngày phát sinh: {formatDate(item.incurredAt)}
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      {item.adjustedByName ?? 'Người dùng đã xoá'}
                    </p>
                  </div>
                ))}
                {history.data && history.data.meta.totalPages > 1 && (
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Trước
                    </Button>
                    <span>
                      {page}/{history.data.meta.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === history.data.meta.totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Sau
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      {target && isOwner && (
        <>
          <SupplierDebtAdjustmentDialog
            open={adjustOpen}
            onOpenChange={setAdjustOpen}
            supplier={target}
            currentDebt={currentDebt}
          />
          <OpeningDebtDialog
            open={openingOpen}
            onOpenChange={setOpeningOpen}
            target={{ kind: 'supplier', id: target.id, name: target.name }}
          />
        </>
      )}
    </>
  )
}

function SupplierDebtAdjustmentDialog({
  open,
  onOpenChange,
  supplier,
  currentDebt,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier: SupplierListItem
  currentDebt: number
}) {
  const [amount, setAmount] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const mutation = useCreateSupplierDebtAdjustmentMutation()
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setAmount(null)
      setReason('')
      setError('')
    }
    onOpenChange(next)
  }
  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = createSupplierDebtAdjustmentSchema.safeParse({
      supplierId: supplier.id,
      newAmount: amount,
      reason,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Thông tin không hợp lệ')
      return
    }
    if (parsed.data.newAmount === currentDebt) {
      setError('Số nợ mới phải khác số nợ hiện tại')
      return
    }
    try {
      await mutation.mutateAsync(parsed.data)
      showSuccess(`Đã điều chỉnh công nợ ${supplier.name}`)
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Không điều chỉnh được công nợ')
    }
  }
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Điều chỉnh công nợ nhà cung cấp</DialogTitle>
          <DialogDescription>
            Thay đổi công nợ của {supplier.name}. Không thể sửa hoặc xoá sau khi lưu.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p>Công nợ hiện tại: {formatVndWithSuffix(currentDebt)}</p>
          <div className="grid gap-2">
            <Label htmlFor="supplier-adjustment-amount">Số nợ mới</Label>
            <CurrencyInput
              id="supplier-adjustment-amount"
              value={amount}
              onChange={(value) => {
                setAmount(value)
                setError('')
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supplier-adjustment-reason">Lý do</Label>
            <Textarea
              id="supplier-adjustment-reason"
              value={reason}
              maxLength={500}
              onChange={(event) => {
                setReason(event.target.value)
                setError('')
              }}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Đang lưu...' : 'Xác nhận điều chỉnh'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
