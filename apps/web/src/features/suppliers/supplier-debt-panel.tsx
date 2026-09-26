import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import type { SupplierListItem } from '@kiotviet-lite/shared'

import { DebtAdjustmentFormDialog } from '@/components/shared/debt-adjustment-form-dialog'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { OpeningDebtDialog } from '@/features/customers/components/OpeningDebtDialog'
import { usePurchaseOrdersQuery } from '@/features/purchase-orders/use-purchase-orders'
import {
  CreateSupplierPaymentDialog,
  type SupplierPaymentPreset,
} from '@/features/supplier-payments/create-supplier-payment-dialog'
import { formatVndWithSuffix } from '@/lib/currency'
import { formatDate } from '@/lib/date'
import { showSuccess } from '@/lib/toast'
import { useAuthStore } from '@/stores/use-auth-store'

import {
  SUPPLIERS_KEY,
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
  const [payPreset, setPayPreset] = useState<SupplierPaymentPreset | null>(null)
  // TIEN-104: phiếu nhập còn nợ của NCC, thanh toán gắn đúng phiếu
  const openOrders = usePurchaseOrdersQuery(
    { supplierId: target?.id, status: 'active', pageSize: 50 },
    { enabled: !!target },
  )
  // Số còn nợ theo phiếu chỉ trừ phần trả lúc nhập và phiếu chi gắn phiếu. Phiếu chi chung (và mọi
  // phiếu chi trước TIEN-104) chỉ trừ vào tổng công nợ, nên số theo phiếu không vượt công nợ NCC và
  // NCC hết nợ thì không liệt kê phiếu nào còn nợ.
  const unpaidOrders =
    currentDebt > 0
      ? (openOrders.data?.data ?? [])
          .map((po) => ({
            po,
            outstanding: Math.min(
              currentDebt,
              Math.max(0, po.totalAmount - po.returnedAmount - po.paidAmount),
            ),
          }))
          .filter((x) => x.outstanding > 0)
      : []

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
                    {currentDebt > 0 && (
                      <Button onClick={() => setPayPreset({ supplierId: target.id })}>
                        Thanh toán
                      </Button>
                    )}
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
              {unpaidOrders.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium">Phiếu nhập còn nợ</h3>
                  <p className="text-xs text-muted-foreground">
                    Chỉ trừ tiền trả lúc nhập và phiếu chi gắn phiếu. Phiếu chi chung trừ vào tổng
                    công nợ ở trên.
                  </p>
                  <div className="rounded-md border divide-y">
                    {unpaidOrders.map(({ po, outstanding }) => (
                      <div
                        key={po.id}
                        className="flex items-center justify-between gap-2 p-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-mono font-medium">{po.code}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(po.purchaseDate)} · còn nợ{' '}
                            {formatVndWithSuffix(outstanding)}
                          </p>
                        </div>
                        {isOwner && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setPayPreset({
                                supplierId: target.id,
                                purchaseOrderId: po.id,
                                purchaseOrderCode: po.code,
                                purchaseOrderOutstanding: outstanding,
                              })
                            }
                          >
                            Thanh toán
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
          <CreateSupplierPaymentDialog
            open={payPreset !== null}
            onOpenChange={(open) => {
              if (!open) setPayPreset(null)
            }}
            preset={payPreset ?? undefined}
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
  const queryClient = useQueryClient()
  const mutation = useCreateSupplierDebtAdjustmentMutation()
  return (
    <DebtAdjustmentFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Điều chỉnh công nợ nhà cung cấp"
      description={`Tăng hoặc giảm công nợ của ${supplier.name}. Không thể sửa hoặc xoá sau khi lưu.`}
      currentDebt={currentDebt}
      onSubmit={async (change) => {
        await mutation.mutateAsync({ supplierId: supplier.id, ...change })
        showSuccess(`Đã điều chỉnh công nợ ${supplier.name}`)
      }}
      onConflict={() => {
        queryClient.invalidateQueries({ queryKey: SUPPLIERS_KEY })
      }}
    />
  )
}
