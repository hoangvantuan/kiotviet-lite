import { useEffect, useMemo, useState } from 'react'
import { Ban, Undo2, Wallet } from 'lucide-react'

import type { PurchaseOrderDetail } from '@kiotviet-lite/shared'

import { CancelDocumentDialog } from '@/components/shared/cancel-document-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CreateSupplierPaymentDialog } from '@/features/supplier-payments/create-supplier-payment-dialog'
import { useGuardedOpenChange } from '@/hooks/use-document-mutation'
import { handleApiError } from '@/lib/api-error'
import { formatVnd, formatVndWithSuffix } from '@/lib/currency'
import { formatDateTime } from '@/lib/date'
import { showSuccess } from '@/lib/toast'
import { useAuthStore } from '@/stores/use-auth-store'

import { purchaseOrderOutstanding } from './purchase-order-outstanding'
import {
  useCancelPurchaseOrderMutation,
  useCreatePurchaseReturnMutation,
} from './use-purchase-orders'

/** Giá trị thực nhập của dòng (sau chiết khấu dòng và phần chiết khấu phiếu phân bổ) */
function lineNet(item: PurchaseOrderDetail['items'][number]): number {
  return item.lineTotal - (item.orderDiscountAllocated ?? 0)
}

export function PurchaseOrderActions({ order }: { order: PurchaseOrderDetail }) {
  const isOwner = useAuthStore((s) => s.user?.role === 'owner')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const cancelMutation = useCancelPurchaseOrderMutation()

  if (order.status !== 'active') return null
  const outstanding = purchaseOrderOutstanding(order)
  const returnable = order.items.some((it) => it.quantity - it.returnedQuantity > 0)
  // Máy chủ chặn hủy khi đã trả hàng hoặc còn phiếu chi gắn phiếu: ẩn nút cho khỏi bấm vô ích
  const cancellable = order.returnedAmount === 0 && order.linkedPaymentAmount === 0

  return (
    <div className="flex flex-wrap gap-2">
      {isOwner && outstanding > 0 && (
        <Button size="sm" onClick={() => setPayOpen(true)}>
          <Wallet className="size-4 mr-1" /> Thanh toán
        </Button>
      )}
      {returnable && (
        <Button variant="outline" size="sm" onClick={() => setReturnOpen(true)}>
          <Undo2 className="size-4 mr-1" /> Trả hàng nhập
        </Button>
      )}
      {cancellable && (
        <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
          <Ban className="size-4 mr-1" /> Hủy phiếu
        </Button>
      )}

      {isOwner && (
        <CreateSupplierPaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          preset={{
            supplierId: order.supplierId,
            purchaseOrderId: order.id,
            purchaseOrderCode: order.code,
            purchaseOrderOutstanding: outstanding,
          }}
        />
      )}
      <PurchaseReturnDialog open={returnOpen} onOpenChange={setReturnOpen} order={order} />
      <CancelDocumentDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Hủy phiếu nhập ${order.code}`}
        description={
          <>
            <p>
              Hàng đã nhập được rút khỏi kho, giá vốn tính lại như chưa nhập, nợ phải trả NCC giảm
              phần còn nợ của phiếu.
            </p>
            {order.initialPaidAmount > 0 && (
              <p>
                Phần đã trả lúc nhập {formatVndWithSuffix(order.initialPaidAmount)} ghi thành tiền
                NCC phải hoàn.
              </p>
            )}
            <p>Tồn kho hiện tại không đủ để rút lại (hàng đã bán) thì không hủy được.</p>
          </>
        }
        isPending={cancelMutation.isPending}
        onConfirm={async (input) => {
          try {
            await cancelMutation.mutateAsync({ id: order.id, input })
            showSuccess(`Đã hủy phiếu nhập ${order.code}`)
          } catch (err) {
            handleApiError(err)
            throw err
          }
        }}
      />
    </div>
  )
}

interface PurchaseReturnDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: PurchaseOrderDetail
}

function PurchaseReturnDialog({ open, onOpenChange, order }: PurchaseReturnDialogProps) {
  const mutation = useCreatePurchaseReturnMutation()
  const handleOpenChange = useGuardedOpenChange(onOpenChange, mutation)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      setQuantities({})
      setNote('')
    }
  }, [open])

  const lines = useMemo(
    () =>
      order.items.map((it) => {
        const max = it.quantity - it.returnedQuantity
        const qty = Math.min(quantities[it.id] ?? 0, max)
        // Ước tính theo giá thực nhập; máy chủ tính chính xác phần dư làm tròn
        const estimate = it.quantity > 0 ? Math.round((lineNet(it) * qty) / it.quantity) : 0
        return { item: it, max, qty, estimate }
      }),
    [order.items, quantities],
  )
  const total = lines.reduce((sum, l) => sum + l.estimate, 0)
  const selected = lines.filter((l) => l.qty > 0)

  const submit = async () => {
    try {
      const res = await mutation.mutateAsync({
        id: order.id,
        input: {
          items: selected.map((l) => ({ purchaseOrderItemId: l.item.id, quantity: l.qty })),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      })
      const r = res.data
      const parts = [
        r.debtReductionAmount > 0 ? `giảm nợ ${formatVndWithSuffix(r.debtReductionAmount)}` : '',
        r.supplierRefundAmount > 0
          ? `NCC phải hoàn ${formatVndWithSuffix(r.supplierRefundAmount)}`
          : '',
      ].filter(Boolean)
      showSuccess(`Đã tạo phiếu trả ${r.code}${parts.length ? `, ${parts.join(', ')}` : ''}`)
      onOpenChange(false)
    } catch (err) {
      handleApiError(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Trả hàng nhập theo phiếu {order.code}</DialogTitle>
          <DialogDescription>
            Trả theo giá thực nhập của dòng (sau chiết khấu). Hàng trả giảm tồn kho, giảm nợ phải
            trả NCC; phần vượt số còn nợ ghi thành tiền NCC phải hoàn.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {lines.map(({ item, max, qty, estimate }) => (
            <div
              key={item.id}
              className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.productNameSnapshot}</p>
                {item.variantLabelSnapshot && (
                  <p className="text-xs text-muted-foreground">{item.variantLabelSnapshot}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Đã nhập {item.quantity}
                  {item.unitName ? ` ${item.unitName}` : ''}, đã trả {item.returnedQuantity}, còn
                  trả được {max}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`return-qty-${item.id}`} className="sr-only">
                  Số lượng trả {item.productNameSnapshot}
                </Label>
                <Input
                  id={`return-qty-${item.id}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={max}
                  disabled={max <= 0 || mutation.isPending}
                  className="w-24 text-right"
                  value={qty || ''}
                  onChange={(e) => {
                    const v = Math.max(0, Math.floor(Number(e.target.value) || 0))
                    setQuantities((prev) => ({ ...prev, [item.id]: Math.min(v, max) }))
                  }}
                />
                <span className="w-28 text-right text-sm">{formatVnd(estimate)}</span>
              </div>
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="purchase-return-note">Ghi chú</Label>
            <Textarea
              id="purchase-return-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="flex justify-between font-semibold">
            <span>Giá trị trả (ước tính)</span>
            <span>{formatVndWithSuffix(total)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={mutation.isPending}
          >
            Đóng
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={selected.length === 0 || mutation.isPending}
          >
            {mutation.isPending ? 'Đang lưu...' : 'Lưu phiếu trả'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PurchaseOrderCancelledNotice({ order }: { order: PurchaseOrderDetail }) {
  if (order.status !== 'cancelled') return null
  return (
    <div
      role="status"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
    >
      <p className="font-medium">
        Phiếu đã hủy{order.cancelledAt ? ` lúc ${formatDateTime(order.cancelledAt)}` : ''}
        {order.cancelledByName ? ` bởi ${order.cancelledByName}` : ''}
      </p>
      {order.cancelReason && <p className="mt-1">Lý do: {order.cancelReason}</p>}
      <p className="mt-1 text-xs">
        Nợ phải trả giảm {formatVndWithSuffix(order.cancelDebtReduction)}
        {order.cancelSupplierRefund > 0
          ? `, NCC phải hoàn ${formatVndWithSuffix(order.cancelSupplierRefund)}`
          : ''}
        .
      </p>
    </div>
  )
}

export function PurchaseReturnsSection({ order }: { order: PurchaseOrderDetail }) {
  if (order.returns.length === 0) return null
  return (
    <section className="rounded-md border p-3 space-y-2">
      <h2 className="text-sm font-medium">Phiếu trả hàng nhập ({order.returns.length})</h2>
      {order.returns.map((r) => (
        <div key={r.id} className="rounded-md bg-muted/40 p-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-mono font-medium">{r.code}</span>
            <span>{formatVndWithSuffix(r.totalAmount)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(r.createdAt)}
            {r.createdByName ? ` bởi ${r.createdByName}` : ''}. Giảm nợ{' '}
            {formatVndWithSuffix(r.debtReductionAmount)}
            {r.supplierRefundAmount > 0
              ? `, NCC phải hoàn ${formatVndWithSuffix(r.supplierRefundAmount)}`
              : ''}
          </p>
          <ul className="mt-1 text-xs">
            {r.items.map((it) => (
              <li key={it.id}>
                {it.productNameSnapshot}
                {it.variantLabelSnapshot ? ` (${it.variantLabelSnapshot})` : ''}: {it.quantity}
                {it.unitName ? ` ${it.unitName}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
