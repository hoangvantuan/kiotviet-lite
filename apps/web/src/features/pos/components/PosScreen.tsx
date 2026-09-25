import { useCallback, useEffect, useRef, useState } from 'react'
import { LayoutGrid, ShoppingCart, WifiOff, X } from 'lucide-react'

import type { ApprovalPermissionInput } from '@kiotviet-lite/shared'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { PinDialog } from '@/features/auth/pin-dialog'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ApiClientError } from '@/lib/api-client'
import { formatVndWithSuffix } from '@/lib/currency'
import { initializeOfflineDB } from '@/lib/pglite'
import { showError, showSuccess } from '@/lib/toast'
import { useAuthStore } from '@/stores/use-auth-store'
import { useCartStore } from '@/stores/use-cart-store'
import { useOfflineStore } from '@/stores/use-offline-store'

import { MAX_CART_TABS } from '../constants'
import { useAddToCart } from '../hooks/use-add-to-cart'
import { useCheckoutMutation } from '../hooks/use-checkout'
import { usePosKeyboard } from '../hooks/use-pos-keyboard'
import { usePosProducts } from '../hooks/use-pos-products'
import { priceApprovalFromError, requiredPriceApproval } from '../price-approval'
import type { OrderDetail, PosProductItem } from '../types'
import { BarcodeScanner } from './BarcodeScanner'
import { CartPanel } from './CartPanel'
import { CartTabBar } from './CartTabBar'
import { CategoryFilter } from './CategoryFilter'
import { DesktopCartTable } from './DesktopCartTable'
import { DesktopCheckoutPanel } from './DesktopCheckoutPanel'
import { OrderCompletionDialog } from './OrderCompletionDialog'
import { PaymentDialog } from './PaymentDialog'
import { PosHeader } from './PosHeader'
import { PosSearchBar } from './PosSearchBar'
import { ProductGrid } from './ProductGrid'
import { VariantSelectionDialog } from './VariantSelectionDialog'

interface PaymentPayload {
  paymentMethod: string
  cashAmount?: number
  transferAmount?: number
  debtAmount?: number
  debtLimitOverridden?: boolean
  debtLimitOverridePin?: string
  debtLimitApproverId?: string
}

export function PosScreen() {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>()
  const [scannerOpen, setScannerOpen] = useState(false)
  const [cartSheetOpen, setCartSheetOpen] = useState(false)
  const [showProductGrid, setShowProductGrid] = useState(false)
  const [variantProduct, setVariantProduct] = useState<PosProductItem | null>(null)
  const [variantDialogOpen, setVariantDialogOpen] = useState(false)

  // Story 3.3: payment & completion dialogs
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentDefaultMethod, setPaymentDefaultMethod] = useState<
    'cash' | 'transfer' | 'qr' | 'combined' | 'debt'
  >('cash')
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false)
  const [completionOrder, setCompletionOrder] = useState<OrderDetail | null>(null)
  // POS-01: đơn chờ người duyệt nhập PIN cho sửa giá hay chiết khấu vượt quyền người bán
  const [priceApproval, setPriceApproval] = useState<{
    permissions: ApprovalPermissionInput[]
    payload: PaymentPayload
  } | null>(null)
  const userRole = useAuthStore((s) => s.user?.role)
  const setPriceOverridePin = useCartStore((s) => s.setPriceOverridePin)

  const offlineStatus = useOfflineStore((s) => s.status)
  useEffect(() => {
    void initializeOfflineDB().catch((error: unknown) => {
      console.error('Không thể chuẩn bị dữ liệu bán hàng ngoại tuyến', error)
    })
  }, [])
  const isOffline =
    offlineStatus === 'offline' || (typeof navigator !== 'undefined' && !navigator.onLine)

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
  const clearCart = useCartStore((s) => s.clearCart)
  const activeTab = useCartStore((s) => s.activeTab)
  const setActiveTab = useCartStore((s) => s.setActiveTab)
  const tabs = useCartStore((s) => s.tabs)

  const searchRef = useRef<HTMLInputElement>(null)
  const { data: products, isLoading } = usePosProducts(selectedCategory)
  const checkoutMutation = useCheckoutMutation()
  const addToCart = useAddToCart()

  function handleSelectProduct(product: PosProductItem) {
    if (product.hasVariants || mode === 'normal') {
      setVariantProduct(product)
      setVariantDialogOpen(true)
      return
    }

    // Quick mode, no variants: add directly
    addToCart({ product })
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

  function handlePaymentComplete(payload: PaymentPayload) {
    // Đọc trạng thái mới nhất: lần gọi lại sau khi duyệt PIN phải thấy PIN vừa lưu
    const cart = useCartStore.getState()
    const tab = cart.tabs[cart.activeTab]
    if (!tab || tab.items.length === 0) return

    const approvalPerms = requiredPriceApproval(tab, userRole, isOffline)
    if (approvalPerms) {
      setPriceApproval({ permissions: approvalPerms, payload })
      return
    }

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
        priceListId: tab.priceListId ?? null,
        priceListName: tab.priceListName ?? null,
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
        debtLimitApproverId: payload.debtLimitApproverId,
        priceOverridePin: tab.priceOverridePin ?? undefined,
        priceApproverId: tab.priceApproverId ?? undefined,
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
          priceSource: item.priceSource,
          priceSourceDetail: item.priceSourceDetail,
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
          if (err instanceof ApiClientError) {
            const perms = priceApprovalFromError(err.code, err.details)
            if (perms) {
              // PIN cũ không đủ quyền (vd bán dưới giá vốn cần chủ cửa hàng): xin duyệt lại
              setPriceOverridePin(null)
              setPriceApproval({ permissions: perms, payload })
            }
          }
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
    onToggleProductGrid: () => setShowProductGrid((v) => !v),
  })

  return (
    <div className="flex h-screen flex-col bg-background">
      <PosHeader
        showProductGrid={showProductGrid}
        onToggleProductGrid={isDesktop ? () => setShowProductGrid((v) => !v) : undefined}
      />

      {isOffline && (
        <div
          data-testid="pos-offline-price-warning"
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-200 shrink-0"
        >
          <WifiOff className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
          <span>
            Đang ngoại tuyến: Không thể cập nhật giá. Giá đang hiện trên từng dòng sẽ được giữ
            nguyên khi hoàn tất đơn.
          </span>
        </div>
      )}

      {isDesktop ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Main wide workspace: Search, Tabs, Multi-line Editor */}
          <div className="flex min-h-0 flex-1 flex-col p-3 gap-2.5 min-w-0">
            {/* Top Bar: Search Bar & Tabs */}
            <div className="shrink-0 flex flex-col gap-2">
              <PosSearchBar
                searchRef={searchRef}
                onOpenScanner={() => setScannerOpen(true)}
                onSelectProduct={handleSelectProduct}
              />
              <CartTabBar />
            </div>

            {/* Middle Workspace: DesktopCartTable (+ optional ProductGrid side-by-side) */}
            <div className="flex min-h-0 flex-1 gap-3">
              {/* Left/Center: Wide multi-line cart table editor */}
              <div className="flex min-h-0 flex-1 flex-col min-w-0">
                <DesktopCartTable />
              </div>

              {/* Optional Product Grid browsing panel */}
              {showProductGrid && (
                <div className="w-[380px] xl:w-[440px] shrink-0 flex flex-col border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2 bg-muted/40">
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">Lưới sản phẩm</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowProductGrid(false)}
                      className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Đóng lưới sản phẩm"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="p-2 border-b border-border bg-background">
                    <CategoryFilter selectedId={selectedCategory} onSelect={setSelectedCategory} />
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                    <ProductGrid
                      products={products}
                      isLoading={isLoading}
                      onSelectProduct={handleSelectProduct}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar: Checkout panel (always visible on desktop!) */}
          <div className="w-[320px] xl:w-[350px] shrink-0 border-l border-border bg-background">
            <DesktopCheckoutPanel onPayment={handleOpenPayment} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Product area on mobile */}
          <div className="flex min-h-0 flex-1 flex-col min-w-0">
            <div className="space-y-3 p-3 pb-0">
              <PosSearchBar
                searchRef={searchRef}
                onOpenScanner={() => setScannerOpen(true)}
                onSelectProduct={handleSelectProduct}
              />
              <CategoryFilter selectedId={selectedCategory} onSelect={setSelectedCategory} />
            </div>
            <div className="flex-1 overflow-y-auto p-3 pb-24">
              <ProductGrid
                products={products}
                isLoading={isLoading}
                onSelectProduct={handleSelectProduct}
              />
            </div>
          </div>

          {/* Floating cart button on mobile */}
          <button
            type="button"
            onClick={() => setCartSheetOpen(true)}
            className="fixed bottom-4 left-4 right-4 z-40 flex h-14 items-center justify-between gap-3 rounded-full bg-primary px-5 text-primary-foreground shadow-lg transition-transform active:scale-[0.98]"
            aria-label={
              cartCount > 0
                ? `Mở giỏ hàng: ${cartCount} sản phẩm, tổng ${formatVndWithSuffix(cartGrandTotal)}`
                : 'Mở giỏ hàng trống'
            }
          >
            <span className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              <span className="text-sm font-semibold">
                {cartCount > 0 ? `${cartCount} SP` : 'Giỏ hàng trống'}
              </span>
            </span>
            {cartCount > 0 && (
              <span className="font-mono text-base font-bold">
                Tổng: {formatVndWithSuffix(cartGrandTotal)}
              </span>
            )}
          </button>

          <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
            <SheetContent side="bottom" className="h-[85vh] p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Giỏ hàng</SheetTitle>
                <SheetDescription>Danh sách sản phẩm trong giỏ hàng</SheetDescription>
              </SheetHeader>
              <CartPanel onPayment={handleOpenPayment} />
            </SheetContent>
          </Sheet>
        </div>
      )}

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

      <PinDialog
        open={priceApproval !== null}
        onOpenChange={(o) => {
          if (!o) setPriceApproval(null)
        }}
        onVerified={(pin, approverId) => {
          const pending = priceApproval
          setPriceApproval(null)
          if (!pin || !pending) return
          setPriceOverridePin(pin, approverId ?? null)
          handlePaymentComplete(pending.payload)
        }}
        title="Duyệt giá và chiết khấu"
        description={
          priceApproval?.permissions.includes('pos.editPriceBelowCost')
            ? 'Đơn bán dưới giá vốn. Chủ cửa hàng nhập mã PIN của mình để duyệt.'
            : 'Đơn có sửa giá hoặc chiết khấu vượt quyền của bạn. Người có quyền nhập mã PIN để duyệt.'
        }
        approvalPermissions={priceApproval?.permissions}
      />

      {/* Story 3.3: Order completion dialog */}
      <OrderCompletionDialog
        open={completionDialogOpen}
        onOpenChange={setCompletionDialogOpen}
        order={completionOrder}
        onNewOrder={handleNewOrder}
      />

      {/* Story 3.3: Keyboard shortcuts help */}
    </div>
  )
}
