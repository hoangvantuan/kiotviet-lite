import { useRef, useState } from 'react'
import { ShoppingCart } from 'lucide-react'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/use-media-query'
import { formatVndWithSuffix } from '@/lib/currency'
import { useCartStore } from '@/stores/use-cart-store'

import { usePosProducts } from '../hooks/use-pos-products'
import type { PosProductItem } from '../types'
import { BarcodeScanner } from './BarcodeScanner'
import { CartPanel } from './CartPanel'
import { CategoryFilter } from './CategoryFilter'
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

  const cartCount = useCartStore((s) =>
    (s.tabs[s.activeTab]?.items ?? []).reduce((sum, i) => sum + i.quantity, 0),
  )
  const cartGrandTotal = useCartStore((s) => {
    const tab = s.tabs[s.activeTab]
    if (!tab) return 0
    const subtotal = tab.items.reduce((sum, i) => sum + i.lineTotal, 0)
    return subtotal - tab.orderDiscountAmount
  })
  const mode = useCartStore((s) => s.mode)
  const addItem = useCartStore((s) => s.addItem)

  const searchRef = useRef<HTMLInputElement>(null)
  const { data: products, isLoading } = usePosProducts(selectedCategory)

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
      imageUrl: product.imageUrl,
      notes: null,
      unitName: null,
      unitConversionId: null,
    })
    setTimeout(() => searchRef.current?.focus(), 0)
  }

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
            <CartPanel />
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
                <CartPanel />
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
    </div>
  )
}
