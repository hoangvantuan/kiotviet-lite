import { useCallback, useRef, useState } from 'react'
import { ShoppingCart } from 'lucide-react'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ApiClientError } from '@/lib/api-client'
import { formatVndWithSuffix } from '@/lib/currency'
import { showError, showSuccess } from '@/lib/toast'
import { useCartStore } from '@/stores/use-cart-store'

import { MAX_CART_TABS } from '../constants'
import { useRepriceOnAdd } from '../hooks/use-auto-reprice'
import { useCheckoutMutation } from '../hooks/use-checkout'
import { usePosKeyboard } from '../hooks/use-pos-keyboard'
import { usePosProducts } from '../hooks/use-pos-products'
import type { OrderDetail, PosProductItem } from '../types'
import { BarcodeScanner } from './BarcodeScanner'
import { CartPanel } from './CartPanel'
import { CategoryFilter } from './CategoryFilter'
import { KeyboardShortcutsTooltip } from './KeyboardShortcutsTooltip'
import { OrderCompletionDialog } from './OrderCompletionDialog'
import { PaymentDialog } from './PaymentDialog'
import { PosHeader } from './PosHeader'
import { PosSearchBar } from './PosSearchBar'
import { ProductGrid } from './ProductGrid'
import { VariantSelectionDialog } from './VariantSelectionDialog'

export function PosScreen() {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>()
  const [scannerOpen, setScannerOpen] = useState(false)
  const [cartSheetOpen, setCartSheetOpen] = useState(false)
  const [variantProduct, setVariantProduct] = useState<PosProductItem | null>(null)
  const [variantDialogOpen, setVariantDialogOpen] = useState(false)

  // Story 3.3: payment & completion dialogs
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentDefaultMethod, setPaymentDefaultMethod] = useState<
    'cash' | 'transfer' | 'qr' | 'combined' | 'debt'
  >('cash')
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false)
  const [completionOrder, setCompletionOrder] = useState<OrderDetail | null>(null)

  const cartCount = useCartStore((s) =>
    (s.tabs[s.activeTab]?.items ?? []).reduce((sum, i) => sum + i.quantity, 0),
  )
  const cartGrandTotal = useCartStore((s) => {
    const tab = s.tabs[s.activeTab]
    if (!tab) return 0
    const subtotal = tab.items.reduce((sum, i) => sum + i.lineTotal, 0)
    return subtotal - tab.orderDiscountAmount
  })
  const cartCustomerId = useCartStore((s) => s.tabs[s.activeTab]?.customerId ?? null)
  const cartCustomerName = useCartStore((s) => s.tabs[s.activeTab]?.customerName ?? null)
  const mode = useCartStore((s) => s.mode)
  const addItem = useCartStore((s) => s.addItem)
  const clearCart = useCartStore((s) => s.clearCart)
  const activeTab = useCartStore((s) => s.activeTab)
  const setActiveTab = useCartStore((s) => s.setActiveTab)
  const tabs = useCartStore((s) => s.tabs)

  const searchRef = useRef<HTMLInputElement>(null)
  const { data: products, isLoading } = usePosProducts(selectedCategory)
  const checkoutMutation = useCheckoutMutation()
  const repriceOnAdd = useRepriceOnAdd()

  function handleSelectProduct(product: PosProductItem) {
    if (product.hasVariants) {
      setVariantProduct(product)
      setVariantDialogOpen(true)
      return
    }

    // Normal mode: show variant dialog for quantity selection
    if (mode === 'normal') {
      setVariantProduct(product)
      setVariantDialogOpen(true)
      return
    }

    // Quick mode, no variants: add directly
    addItem({
      productId: product.id,
      variantId: null,
      productName: product.name,
      variantName: null,
      sku: product.sku,
      unitPrice: product.basePrice,
      costPrice: product.costPrice,
      imageUrl: product.imageUrl,
      notes: null,
      unitName: null,
      unitConversionId: null,
    })
    repriceOnAdd(product.id, null, 1)
    setTimeout(() => searchRef.current?.focus(), 0)
  }

  // Payment flow
  const handleOpenPayment = useCallback(() => {
    if (cartCount === 0 || cartGrandTotal <= 0) return
    setPaymentDefaultMethod('cash')
    setPaymentDialogOpen(true)
  }, [cartCount, cartGrandTotal])

  // Story 5.1: F4 mở PaymentDialog với tab Ghi nợ
  const handleOpenDebtPayment = useCallback(() => {
    if (cartCount === 0 || cartGrandTotal <= 0) return
    if (!cartCustomerId) {
      showError('Vui lòng chọn khách hàng để ghi nợ')
      return
    }
    setPaymentDefaultMethod('debt')
    setPaymentDialogOpen(true)
  }, [cartCount, cartGrandTotal, cartCustomerId])

  function handlePaymentComplete(payload: {
    paymentMethod: string
    cashAmount?: number
    transferAmount?: number
    debtAmount?: number
    debtLimitOverridden?: boolean
    debtLimitOverridePin?: string
  }) {
    const tab = tabs[activeTab]
    if (!tab || tab.items.length === 0) return

    const subtotal = tab.items.reduce((sum, i) => sum + i.lineTotal, 0)
    const total = subtotal - tab.orderDiscountAmount
    const debtAmount = payload.debtAmount ?? 0

    // Story 5.1: paymentStatus dựa trên debtAmount
    let paymentStatus: 'paid' | 'partial' | 'unpaid' = 'paid'
    if (debtAmount > 0) {
      paymentStatus = debtAmount === total ? 'unpaid' : 'partial'
    }

    checkoutMutation.mutate(
      {
        customerId: tab.customerId ?? null,
        subtotal,
        discountType: tab.orderDiscountType,
        discountValue: tab.orderDiscountValue,
        discountAmount: tab.orderDiscountAmount,
        total,
        paymentMethod: payload.paymentMethod,
        paymentStatus,
        cashAmount: payload.cashAmount,
        transferAmount: payload.transferAmount,
        debtAmount: debtAmount > 0 ? debtAmount : undefined,
        debtLimitOverridden: payload.debtLimitOverridden ?? false,
        debtLimitOverridePin: payload.debtLimitOverridePin,
        note: null,
        items: tab.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          variantName: item.variantName,
          unit: item.unitName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          discountType: item.discountType,
          discountValue: item.discountValue,
          discountAmount: item.discountAmount,
          lineTotal: item.lineTotal,
          note: item.notes,
          unitConversionId: item.unitConversionId,
          originalPrice: item.originalPrice,
          priceOverride: item.priceOverride,
          priceOverrideReason: item.priceOverrideReason,
          priceOverridePinUsed: item.priceOverridePinUsed,
        })),
      },
      {
        onSuccess: (response) => {
          setPaymentDialogOpen(false)
          setCompletionOrder(response.data)
          setCompletionDialogOpen(true)
          showSuccess('Đơn hàng đã hoàn thành!')
        },
        onError: (err) => {
          const msg =
            err instanceof ApiClientError
              ? err.message
              : 'Không thể tạo đơn hàng. Vui lòng thử lại.'
          showError(msg)
        },
      },
    )
  }

  function handleNewOrder() {
    clearCart()
    setCompletionDialogOpen(false)
    setCompletionOrder(null)
    setTimeout(() => searchRef.current?.focus(), 0)
  }

  // Find next empty tab for F5
  const handleNewTab = useCallback(() => {
    for (let i = 1; i <= MAX_CART_TABS; i++) {
      const tabItems = tabs[i]?.items ?? []
      if (tabItems.length === 0 && i !== activeTab) {
        setActiveTab(i)
        setTimeout(() => searchRef.current?.focus(), 0)
        return
      }
    }
    // No empty tab found, stay on current
  }, [tabs, activeTab, setActiveTab])

  // Focus search callback (stable ref, no re-creation)
  const handleFocusSearch = useCallback(() => {
    searchRef.current?.focus()
  }, [])

  // Keyboard shortcuts
  usePosKeyboard({
    onPayment: handleOpenPayment,
    onNewOrder: handleNewTab,
    onFocusSearch: handleFocusSearch,
    onDebtPayment: handleOpenDebtPayment,
  })

  return (
    <div className="flex h-screen flex-col bg-background">
      <PosHeader />

      <div className="flex min-h-0 flex-1">
        {/* Product area */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-3 p-3 pb-0">
            <PosSearchBar
              searchRef={searchRef}
              onOpenScanner={() => setScannerOpen(true)}
              onSelectProduct={handleSelectProduct}
            />
            <CategoryFilter selectedId={selectedCategory} onSelect={setSelectedCategory} />
          </div>
          <div className="flex-1 overflow-y-auto p-3 pb-24 md:pb-3">
            <ProductGrid
              products={products}
              isLoading={isLoading}
              onSelectProduct={handleSelectProduct}
            />
          </div>
        </div>

        {/* Cart area: sidebar on desktop, bottom sheet on mobile */}
        {isDesktop ? (
          <div className="w-80 shrink-0 border-l border-border bg-background lg:w-96">
            <CartPanel onPayment={handleOpenPayment} />
          </div>
        ) : (
          <>
            {/* Floating cart button on mobile */}
            <button
              type="button"
              onClick={() => setCartSheetOpen(true)}
              className="fixed bottom-4 left-4 right-4 z-40 flex h-14 items-center justify-between gap-3 rounded-full bg-primary px-5 text-primary-foreground shadow-lg transition-transform active:scale-[0.98]"
              aria-label={
                cartCount > 0
                  ? `Mo gio hang: ${cartCount} san pham, tong ${formatVndWithSuffix(cartGrandTotal)}`
                  : 'Mo gio hang trong'
              }
            >
              <span className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" aria-hidden="true" />
                <span className="text-sm font-semibold">
                  {cartCount > 0 ? `${cartCount} SP` : 'Gio hang trong'}
                </span>
              </span>
              {cartCount > 0 && (
                <span className="font-mono text-base font-bold">
                  Tong: {formatVndWithSuffix(cartGrandTotal)}
                </span>
              )}
            </button>

            <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
              <SheetContent side="bottom" className="h-[85vh] p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>Gio hang</SheetTitle>
                  <SheetDescription>Danh sach san pham trong gio hang</SheetDescription>
                </SheetHeader>
                <CartPanel onPayment={handleOpenPayment} />
              </SheetContent>
            </Sheet>
          </>
        )}
      </div>

      {/* Barcode scanner dialog */}
      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onSelectProduct={handleSelectProduct}
      />

      {/* Variant selection dialog */}
      <VariantSelectionDialog
        product={variantProduct}
        open={variantDialogOpen}
        onOpenChange={(open) => {
          setVariantDialogOpen(open)
          if (!open) {
            setVariantProduct(null)
            setTimeout(() => searchRef.current?.focus(), 0)
          }
        }}
      />

      {/* Story 3.3: Payment dialog */}
      <PaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        grandTotal={cartGrandTotal}
        customerId={cartCustomerId}
        customerName={cartCustomerName}
        defaultMethod={paymentDefaultMethod}
        onComplete={handlePaymentComplete}
        isLoading={checkoutMutation.isPending}
      />

      {/* Story 3.3: Order completion dialog */}
      <OrderCompletionDialog
        open={completionDialogOpen}
        onOpenChange={setCompletionDialogOpen}
        order={completionOrder}
        onNewOrder={handleNewOrder}
      />

      {/* Story 3.3: Keyboard shortcuts help */}
      <KeyboardShortcutsTooltip />
    </div>
  )
}
