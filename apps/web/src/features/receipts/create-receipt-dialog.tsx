import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'

import type { CreateReceiptInput, OpenDebtItem, ReceiptDetail } from '@kiotviet-lite/shared'

import { CurrencyInput } from '@/components/shared/currency-input'
import { Badge } from '@/components/ui/badge'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useCustomersQuery } from '@/features/customers/use-customers'
import { useDebounced } from '@/hooks/use-debounced'
import { ApiClientError } from '@/lib/api-client'
import { formatVnd, formatVndWithSuffix } from '@/lib/currency'
import { showError } from '@/lib/toast'

import { useCreateReceiptMutation, useCustomerOpenDebtsQuery } from './use-receipts'
import { computeFifoAllocation } from './utils'

interface SelectedCustomer {
  id: string
  name: string
  phone: string
  currentDebt: number
}

interface CreateReceiptDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated?: (receipt: ReceiptDetail) => void
}

function handleApiError(err: unknown) {
  if (err instanceof ApiClientError) {
    showError(err.message)
    return
  }
  showError('Đã có lỗi xảy ra, vui lòng thử lại')
}

type Mode = 'fifo' | 'manual'

export function CreateReceiptDialog({ open, onOpenChange, onCreated }: CreateReceiptDialogProps) {
  const mutation = useCreateReceiptMutation()

  const [generation, setGeneration] = useState(0)

  // Section 1: Customer
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounced(searchInput, 300)
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null)

  const customersQuery = useCustomersQuery({
    pageSize: 20,
    hasDebt: 'yes',
    search: debouncedSearch.trim() || undefined,
  })
  const customers = customersQuery.data?.data ?? []

  const debtsQuery = useCustomerOpenDebtsQuery(selectedCustomer?.id)
  const openDebts = useMemo<OpenDebtItem[]>(
    () => debtsQuery.data?.items ?? [],
    [debtsQuery.data?.items],
  )
  const totalRemaining = debtsQuery.data?.totalRemaining ?? selectedCustomer?.currentDebt ?? 0

  // Section 2: Amount
  const [amount, setAmount] = useState<number>(0)

  // Section 3: Allocation mode + map
  const [mode, setMode] = useState<Mode>('fifo')
  const [manualAllocations, setManualAllocations] = useState<Record<string, number>>({})
  const [manualSelected, setManualSelected] = useState<Record<string, boolean>>({})

  // Section 4: Note
  const [note, setNote] = useState<string>('')

  // Reset all state when dialog opens
  useEffect(() => {
    if (open) {
      setGeneration((g) => g + 1)
      setSearchInput('')
      setSelectedCustomer(null)
      setAmount(0)
      setMode('fifo')
      setManualAllocations({})
      setManualSelected({})
      setNote('')
    }
  }, [open])

  // Reset allocations when customer changes
  useEffect(() => {
    setAmount(0)
    setManualAllocations({})
    setManualSelected({})
  }, [selectedCustomer?.id])

  // Reset allocations when switching mode
  useEffect(() => {
    if (mode === 'manual') {
      setManualAllocations({})
      setManualSelected({})
    }
  }, [mode])

  const fifoComputed = useMemo(() => {
    if (mode !== 'fifo' || amount <= 0) return { allocations: [], unallocated: amount }
    return computeFifoAllocation(openDebts, amount)
  }, [mode, amount, openDebts])

  const allocationMap = useMemo(() => {
    if (mode === 'fifo') {
      const m = new Map<string, number>()
      for (const a of fifoComputed.allocations) m.set(a.debtId, a.amount)
      return m
    }
    const m = new Map<string, number>()
    for (const [id, val] of Object.entries(manualAllocations)) {
      if (manualSelected[id] && val > 0) m.set(id, val)
    }
    return m
  }, [mode, fifoComputed, manualAllocations, manualSelected])

  const sumAllocations = useMemo(() => {
    let total = 0
    for (const v of allocationMap.values()) total += v
    return total
  }, [allocationMap])

  const allocations = useMemo(
    () => Array.from(allocationMap.entries()).map(([debtId, value]) => ({ debtId, amount: value })),
    [allocationMap],
  )

  const customerSelected = Boolean(selectedCustomer)
  const amountValid = amount > 0 && amount <= totalRemaining
  const balanced = sumAllocations === amount && allocations.length > 0
  const canSubmit = customerSelected && amount > 0 && amountValid && balanced && !mutation.isPending

  const submit = async () => {
    if (!selectedCustomer) return
    if (!balanced) return
    const payload: CreateReceiptInput = {
      customerId: selectedCustomer.id,
      amount,
      note: note.trim() ? note.trim() : null,
      allocationMode: mode,
      allocations,
    }
    try {
      const result = await mutation.mutateAsync(payload)
      onOpenChange(false)
      onCreated?.(result.data)
    } catch (err) {
      handleApiError(err)
    }
  }

  return (
    <Dialog key={generation} open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo phiếu thu nợ</DialogTitle>
          <DialogDescription>
            Phiếu thu sẽ giảm trực tiếp công nợ KH. Không thể sửa hoặc xoá sau khi tạo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Section 1: Customer */}
          <section className="space-y-2">
            <Label>
              Khách hàng <span className="text-destructive">*</span>
            </Label>
            {selectedCustomer ? (
              <div className="rounded-md border bg-muted/30 p-3 flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{selectedCustomer.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {selectedCustomer.phone}
                  </p>
                  <p className="text-sm mt-1">
                    Tổng nợ còn lại:{' '}
                    <span className="font-semibold">{formatVndWithSuffix(totalRemaining)}</span>
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCustomer(null)}
                  aria-label="Đổi khách hàng"
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Tìm theo tên hoặc số điện thoại"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                </div>
                {customersQuery.isLoading && (
                  <p className="text-xs text-muted-foreground">Đang tìm...</p>
                )}
                {!customersQuery.isLoading && customers.length === 0 && (
                  <p className="text-xs text-muted-foreground">Không tìm thấy khách hàng còn nợ</p>
                )}
                {customers.length > 0 && (
                  <div className="rounded-md border max-h-60 overflow-y-auto">
                    {customers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left p-2 hover:bg-accent flex items-center justify-between gap-2 border-b last:border-b-0"
                        onClick={() =>
                          setSelectedCustomer({
                            id: c.id,
                            name: c.name,
                            phone: c.phone,
                            currentDebt: c.currentDebt,
                          })
                        }
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{c.phone}</p>
                        </div>
                        <p className="text-xs text-muted-foreground shrink-0">
                          Nợ: {formatVndWithSuffix(c.currentDebt)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Section 2: Amount */}
          {selectedCustomer && (
            <section className="space-y-2">
              <Label htmlFor="receipt-amount">
                Số tiền thu <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <CurrencyInput
                  id="receipt-amount"
                  value={amount || null}
                  onChange={(v) => setAmount(v ?? 0)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={totalRemaining <= 0}
                  onClick={() => setAmount(totalRemaining)}
                >
                  Thu hết
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Tổng nợ còn lại: {formatVndWithSuffix(totalRemaining)}. Tối đa:{' '}
                {formatVndWithSuffix(totalRemaining)}
              </p>
              {amount > totalRemaining && (
                <p className="text-xs text-destructive">Số tiền thu vượt quá nợ còn lại</p>
              )}
            </section>
          )}

          {/* Section 3: Allocation */}
          {selectedCustomer && amount > 0 && amount <= totalRemaining && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>
                  Phân bổ vào các khoản nợ <span className="text-destructive">*</span>
                </Label>
                <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
                  <TabsList>
                    <TabsTrigger value="fifo">FIFO tự động</TabsTrigger>
                    <TabsTrigger value="manual">Thủ công</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {openDebts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Khách hàng không có khoản nợ nào còn lại
                </p>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        {mode === 'manual' && <th className="p-2 text-left w-8"> </th>}
                        <th className="p-2 text-left">Mã đơn</th>
                        <th className="p-2 text-left">Ngày</th>
                        <th className="p-2 text-right">Nợ trước</th>
                        <th className="p-2 text-right">Phân bổ</th>
                        <th className="p-2 text-right">Nợ sau</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openDebts.map((d) => {
                        const allocated = allocationMap.get(d.id) ?? 0
                        const after = d.remaining - allocated
                        const fullySettled = after === 0 && allocated > 0
                        const checked = manualSelected[d.id] ?? false
                        return (
                          <tr key={d.id} className="border-t">
                            {mode === 'manual' && (
                              <td className="p-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const isChecked = e.target.checked
                                    setManualSelected((prev) => ({
                                      ...prev,
                                      [d.id]: isChecked,
                                    }))
                                    if (!isChecked) {
                                      setManualAllocations((prev) => {
                                        const next = { ...prev }
                                        delete next[d.id]
                                        return next
                                      })
                                    }
                                  }}
                                />
                              </td>
                            )}
                            <td className="p-2 font-mono text-xs">{d.orderCode}</td>
                            <td className="p-2 text-xs text-muted-foreground">
                              {new Date(d.createdAt).toLocaleDateString('vi-VN')}
                            </td>
                            <td className="p-2 text-right">{formatVnd(d.remaining)}</td>
                            <td className="p-2 text-right">
                              {mode === 'fifo' ? (
                                <span>{formatVnd(allocated)}</span>
                              ) : (
                                <CurrencyInput
                                  value={manualAllocations[d.id] ?? null}
                                  onChange={(v) => {
                                    const raw = v ?? 0
                                    const clamped = Math.min(Math.max(raw, 0), d.remaining)
                                    setManualAllocations((prev) => ({
                                      ...prev,
                                      [d.id]: clamped,
                                    }))
                                  }}
                                  disabled={!checked}
                                  className="text-right"
                                />
                              )}
                            </td>
                            <td className="p-2 text-right">
                              {formatVnd(after)}
                              {fullySettled && (
                                <Badge variant="secondary" className="ml-1">
                                  Tất toán
                                </Badge>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Live counter */}
              <div className="flex items-center justify-end text-sm">
                <span className="text-muted-foreground mr-2">Đã phân bổ:</span>
                <span className="font-semibold">
                  {formatVnd(sumAllocations)} / {formatVnd(amount)}
                </span>
                {sumAllocations < amount && (
                  <span className="ml-2 text-yellow-600">
                    Còn thiếu: {formatVnd(amount - sumAllocations)}
                  </span>
                )}
                {sumAllocations > amount && (
                  <span className="ml-2 text-destructive">
                    Vượt: {formatVnd(sumAllocations - amount)}
                  </span>
                )}
                {sumAllocations === amount && allocations.length > 0 && (
                  <span className="ml-2 text-green-600">Cân bằng</span>
                )}
              </div>
            </section>
          )}

          {/* Section 4: Note */}
          {selectedCustomer && (
            <section className="space-y-2">
              <Label htmlFor="receipt-note">Ghi chú</Label>
              <Textarea
                id="receipt-note"
                rows={3}
                maxLength={500}
                placeholder="VD: Thu tiền nợ tháng 4, tiền mặt"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <p className="text-xs text-muted-foreground text-right">{note.length}/500</p>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit}>
            {mutation.isPending ? 'Đang lưu...' : 'Xác nhận thu tiền'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
