import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Plus, Trash2 } from 'lucide-react'

import type {
  CreatePurchaseOrderInput,
  DiscountType,
  PaymentStatus,
  ProductDetail,
  VariantItem,
} from '@kiotviet-lite/shared'

import { CurrencyInput } from '@/components/shared/currency-input'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useDebounced } from '@/hooks/use-debounced'
import { ApiClientError } from '@/lib/api-client'
import { formatVnd, formatVndWithSuffix } from '@/lib/currency'
import { showError, showSuccess } from '@/lib/toast'

import { getProductApi } from '../products/products-api'
import { useProductsQuery } from '../products/use-products'
import { useSuppliersQuery } from '../suppliers/use-suppliers'
import { computeLineTotal, computeOrderTotals } from './purchase-order-utils'
import { useCreatePurchaseOrderMutation } from './use-purchase-orders'
import { VariantPickerDialog } from './variant-picker-dialog'

interface ItemRow {
  tempId: string
  productId: string
  variantId: string | null
  productName: string
  productSku: string
  variantLabel: string | null
  costPrice: number | null
  quantity: number
  unitPrice: number
  discountType: DiscountType
  discountValue: number
}

function discountValueToDisplay(type: DiscountType, apiValue: number): number {
  if (type === 'percent') return apiValue / 100
  return apiValue
}

function displayToDiscountValue(type: DiscountType, displayValue: number): number {
  if (type === 'percent') return Math.round(Math.max(0, Math.min(100, displayValue)) * 100)
  return Math.max(0, Math.round(displayValue))
}

let TEMP_ID_COUNTER = 0
const nextTempId = () => `t-${++TEMP_ID_COUNTER}-${Date.now()}`

export function PurchaseOrderForm() {
  const navigate = useNavigate()
  const createMutation = useCreatePurchaseOrderMutation()

  const [supplierId, setSupplierId] = useState<string>('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const debouncedSupplierSearch = useDebounced(supplierSearch, 300)
  const suppliersQuery = useSuppliersQuery({
    pageSize: 20,
    search: debouncedSupplierSearch.trim() || undefined,
  })
  const supplierItems = suppliersQuery.data?.data ?? []
  const selectedSupplier = supplierItems.find((s) => s.id === supplierId)

  const [purchaseDate, setPurchaseDate] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  const [items, setItems] = useState<ItemRow[]>([])

  const [productSearch, setProductSearch] = useState('')
  const debouncedProductSearch = useDebounced(productSearch, 300)
  const productsQuery = useProductsQuery({
    pageSize: 20,
    search: debouncedProductSearch.trim() || undefined,
  })
  const productItems = productsQuery.data?.data ?? []

  const [variantPickerProduct, setVariantPickerProduct] = useState<ProductDetail | null>(null)

  const [discountTotalType, setDiscountTotalType] = useState<DiscountType>('amount')
  const [discountTotalValue, setDiscountTotalValue] = useState<number>(0)
  const [paidAmount, setPaidAmount] = useState<number>(0)
  const [paymentSelect, setPaymentSelect] = useState<PaymentStatus>('unpaid')
  const [note, setNote] = useState('')

  const subtotal = useMemo(
    () =>
      items.reduce((acc, it) => {
        const r = computeLineTotal(it.quantity, it.unitPrice, it.discountType, it.discountValue)
        return acc + r.lineTotal
      }, 0),
    [items],
  )

  const { totalAmount } = useMemo(
    () =>
      computeOrderTotals({
        subtotal,
        discountTotalType,
        discountTotalValue,
      }),
    [subtotal, discountTotalType, discountTotalValue],
  )

  // Sync paidAmount when payment select changes
  useEffect(() => {
    if (paymentSelect === 'unpaid') setPaidAmount(0)
    if (paymentSelect === 'paid') setPaidAmount(totalAmount)
  }, [paymentSelect, totalAmount])

  const remaining = Math.max(0, totalAmount - paidAmount)

  const addProduct = async (productId: string) => {
    try {
      const detail = (await getProductApi(productId)).data
      if (detail.hasVariants) {
        const variants = detail.variantsConfig?.variants ?? []
        if (variants.length === 0) {
          showError('Sản phẩm có biến thể nhưng chưa có biến thể nào')
          return
        }
        setVariantPickerProduct(detail)
        setProductSearch('')
        return
      }
      const exists = items.some((it) => it.productId === productId && it.variantId === null)
      if (exists) {
        showError('Sản phẩm đã có trong phiếu, vui lòng cập nhật số lượng dòng cũ')
        return
      }
      setItems((prev) => [
        ...prev,
        {
          tempId: nextTempId(),
          productId,
          variantId: null,
          productName: detail.name,
          productSku: detail.sku,
          variantLabel: null,
          costPrice: detail.costPrice,
          quantity: 1,
          unitPrice: detail.costPrice ?? 0,
          discountType: 'amount',
          discountValue: 0,
        },
      ])
      setProductSearch('')
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Không tải được sản phẩm'
      showError(msg)
    }
  }

  const onVariantsConfirmed = (variants: VariantItem[]) => {
    const product = variantPickerProduct
    if (!product) return
    setItems((prev) => {
      const existingIds = new Set(
        prev.filter((it) => it.productId === product.id).map((it) => it.variantId),
      )
      const fallbackCost = product.costPrice
      const additions: ItemRow[] = []
      let skipped = 0
      for (const v of variants) {
        if (existingIds.has(v.id)) {
          skipped++
          continue
        }
        const cost = v.costPrice ?? fallbackCost
        additions.push({
          tempId: nextTempId(),
          productId: product.id,
          variantId: v.id,
          productName: product.name,
          productSku: v.sku,
          variantLabel: v.attribute2Value
            ? `${v.attribute1Value} - ${v.attribute2Value}`
            : v.attribute1Value,
          costPrice: cost,
          quantity: 1,
          unitPrice: cost ?? 0,
          discountType: 'amount',
          discountValue: 0,
        })
      }
      if (skipped > 0) {
        showError(`${skipped} biến thể đã có sẵn trong phiếu, đã bỏ qua`)
      }
      return [...prev, ...additions]
    })
    setVariantPickerProduct(null)
  }

  const excludedVariantIds = useMemo(() => {
    if (!variantPickerProduct) return [] as string[]
    return items
      .filter((it) => it.productId === variantPickerProduct.id && it.variantId)
      .map((it) => it.variantId as string)
  }, [items, variantPickerProduct])

  const updateItem = (tempId: string, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, ...patch } : it)))
  }

  const removeItem = (tempId: string) => {
    setItems((prev) => prev.filter((it) => it.tempId !== tempId))
  }

  const submitDisabled =
    !supplierId ||
    items.length === 0 ||
    items.some((it) => it.quantity < 1 || it.unitPrice < 0) ||
    paidAmount > totalAmount ||
    paidAmount < 0 ||
    createMutation.isPending

  const onSubmit = async () => {
    if (!supplierId) {
      showError('Vui lòng chọn nhà cung cấp')
      return
    }
    if (items.length === 0) {
      showError('Phiếu nhập phải có ít nhất 1 sản phẩm')
      return
    }
    const payload: CreatePurchaseOrderInput = {
      supplierId,
      purchaseDate: `${purchaseDate}T00:00:00.000Z`,
      items: items.map((it) => ({
        productId: it.productId,
        variantId: it.variantId ?? null,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discountType: it.discountType,
        discountValue: it.discountValue,
      })),
      discountTotalType,
      discountTotalValue,
      paidAmount,
      note: note.trim() || undefined,
    }
    try {
      const result = await createMutation.mutateAsync(payload)
      showSuccess(`Đã tạo phiếu nhập ${result.data.code}`)
      navigate({
        to: '/inventory/purchase-orders/$orderId',
        params: { orderId: result.data.id },
      })
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError(err.message)
      } else {
        showError('Không tạo được phiếu nhập')
      }
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6 pb-32">
      <header>
        <h1 className="text-2xl font-semibold">Tạo phiếu nhập kho</h1>
        <p className="text-sm text-muted-foreground">
          Mã phiếu PN-YYYYMMDD-XXXX sẽ tự sinh khi lưu.
        </p>
      </header>

      <section className="rounded-md border p-4 space-y-4">
        <h2 className="text-base font-semibold">Thông tin chung</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>Nhà cung cấp</Label>
            <Input
              placeholder="Tìm NCC theo tên hoặc SĐT"
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
            />
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn NCC" />
              </SelectTrigger>
              <SelectContent>
                {supplierItems.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} {s.phone ? `· ${s.phone}` : ''}
                    {s.currentDebt > 0 ? ` · Nợ ${formatVndWithSuffix(s.currentDebt)}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSupplier && (
              <p className="text-xs text-muted-foreground">
                Đã chọn: {selectedSupplier.name}
                {selectedSupplier.currentDebt > 0
                  ? ` · Công nợ hiện tại: ${formatVndWithSuffix(selectedSupplier.currentDebt)}`
                  : ''}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="purchase-date">Ngày nhập</Label>
            <Input
              id="purchase-date"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-md border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Danh sách sản phẩm</h2>
          <span className="text-xs text-muted-foreground">{items.length} dòng</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            placeholder="Tìm sản phẩm theo tên hoặc SKU"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="sm:max-w-md"
          />
        </div>
        {productSearch.trim() && productItems.length > 0 && (
          <div className="rounded-md border bg-muted/30 max-h-56 overflow-y-auto">
            {productItems.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-accent flex justify-between items-center gap-2"
                onClick={() => addProduct(p.id)}
              >
                <span className="truncate">
                  <span className="font-medium">{p.name}</span>{' '}
                  <span className="text-xs text-muted-foreground font-mono">{p.sku}</span>
                </span>
                <Plus className="size-4 shrink-0" />
              </button>
            ))}
          </div>
        )}

        {items.length === 0 ? (
          <EmptyState
            icon={Plus}
            title="Chưa có sản phẩm"
            description="Tìm và chọn sản phẩm để thêm vào phiếu nhập."
          />
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">STT</TableHead>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead className="hidden md:table-cell">SKU</TableHead>
                  <TableHead className="w-24">SL</TableHead>
                  <TableHead className="w-36">Đơn giá</TableHead>
                  <TableHead className="w-44">Chiết khấu</TableHead>
                  <TableHead className="w-36 text-right">Thành tiền</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, idx) => {
                  const r = computeLineTotal(
                    it.quantity,
                    it.unitPrice,
                    it.discountType,
                    it.discountValue,
                  )
                  return (
                    <TableRow key={it.tempId}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>
                        <div className="font-medium">{it.productName}</div>
                        {it.variantLabel && (
                          <div className="text-xs text-muted-foreground">{it.variantLabel}</div>
                        )}
                        {it.costPrice !== null && (
                          <div className="text-xs text-muted-foreground">
                            Giá vốn hiện tại: {formatVndWithSuffix(it.costPrice)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-xs">
                        {it.productSku}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={it.quantity}
                          onChange={(e) =>
                            updateItem(it.tempId, {
                              quantity: Math.max(1, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <CurrencyInput
                          value={it.unitPrice}
                          onChange={(v) => updateItem(it.tempId, { unitPrice: v ?? 0 })}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={it.discountType === 'percent' ? 100 : undefined}
                            step={it.discountType === 'percent' ? 0.01 : 1}
                            className="w-20"
                            value={discountValueToDisplay(it.discountType, it.discountValue)}
                            onChange={(e) =>
                              updateItem(it.tempId, {
                                discountValue: displayToDiscountValue(
                                  it.discountType,
                                  Number(e.target.value) || 0,
                                ),
                              })
                            }
                          />
                          <Select
                            value={it.discountType}
                            onValueChange={(v: DiscountType) =>
                              updateItem(it.tempId, {
                                discountType: v,
                                discountValue: 0,
                              })
                            }
                          >
                            <SelectTrigger className="w-20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="amount">đ</SelectItem>
                              <SelectItem value="percent">%</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatVnd(r.lineTotal)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Xoá dòng"
                          onClick={() => removeItem(it.tempId)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="rounded-md border p-4 space-y-3 bg-card sticky bottom-0">
        <h2 className="text-base font-semibold">Thanh toán</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tổng tiền hàng</span>
              <span className="font-medium">{formatVndWithSuffix(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground shrink-0">Chiết khấu phiếu</span>
              <div className="flex gap-1">
                <Input
                  type="number"
                  min={0}
                  max={discountTotalType === 'percent' ? 100 : undefined}
                  step={discountTotalType === 'percent' ? 0.01 : 1}
                  className="w-24"
                  value={discountValueToDisplay(discountTotalType, discountTotalValue)}
                  onChange={(e) =>
                    setDiscountTotalValue(
                      displayToDiscountValue(discountTotalType, Number(e.target.value) || 0),
                    )
                  }
                />
                <Select
                  value={discountTotalType}
                  onValueChange={(v: DiscountType) => {
                    setDiscountTotalType(v)
                    setDiscountTotalValue(0)
                  }}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">đ</SelectItem>
                    <SelectItem value="percent">%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-base font-semibold">Tổng thanh toán</span>
              <span className="text-base font-bold">{formatVndWithSuffix(totalAmount)}</span>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <Label>Trạng thái thanh toán</Label>
            <Select value={paymentSelect} onValueChange={(v: PaymentStatus) => setPaymentSelect(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">Chưa trả</SelectItem>
                <SelectItem value="partial">Trả một phần</SelectItem>
                <SelectItem value="paid">Trả đủ</SelectItem>
              </SelectContent>
            </Select>
            <Label>Số tiền đã trả</Label>
            <CurrencyInput
              value={paidAmount}
              onChange={(v) => setPaidAmount(v ?? 0)}
              disabled={paymentSelect !== 'partial'}
            />
            {remaining > 0 && (
              <p className="text-xs text-amber-600">Còn nợ NCC: {formatVndWithSuffix(remaining)}</p>
            )}
            {paidAmount > totalAmount && (
              <p className="text-xs text-destructive">Số tiền đã trả vượt quá tổng phiếu.</p>
            )}
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="po-note">Ghi chú</Label>
          <Textarea id="po-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate({ to: '/inventory/purchase-orders' })}
          >
            Hủy
          </Button>
          <Button onClick={onSubmit} disabled={submitDisabled}>
            {createMutation.isPending ? 'Đang lưu...' : 'Lưu phiếu nhập'}
          </Button>
        </div>
      </section>

      <VariantPickerDialog
        open={!!variantPickerProduct}
        onOpenChange={(v) => {
          if (!v) setVariantPickerProduct(null)
        }}
        product={variantPickerProduct}
        excludedVariantIds={excludedVariantIds}
        onConfirm={onVariantsConfirmed}
      />
    </div>
  )
}
