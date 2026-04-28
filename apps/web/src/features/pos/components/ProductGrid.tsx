import { Package } from 'lucide-react'

import { formatVndWithSuffix } from '@/lib/currency'
import { useCartStore } from '@/stores/use-cart-store'

import type { PosProductItem } from '../types'

interface ProductGridProps {
  products: PosProductItem[] | undefined
  isLoading: boolean
  onSelectProduct: (product: PosProductItem) => void
}

function ProductCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-border bg-card">
      <div className="aspect-square w-full rounded-t-lg bg-muted" />
      <div className="space-y-2 p-2">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-4 w-1/2 rounded bg-muted" />
      </div>
    </div>
  )
}

export function ProductGrid({ products, isLoading, onSelectProduct }: ProductGridProps) {
  const mode = useCartStore((s) => s.mode)
  const addItem = useCartStore((s) => s.addItem)

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-3 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (!products || products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Package className="h-12 w-12 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Không có sản phẩm nào</p>
      </div>
    )
  }

  function handleClick(product: PosProductItem) {
    const isOutOfStock = product.trackInventory && product.stockQuantity <= 0
    if (isOutOfStock) return

    if (product.hasVariants) {
      onSelectProduct(product)
      return
    }

    if (mode === 'quick') {
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
    } else {
      onSelectProduct(product)
    }
  }

  return (
    <div className="grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-3 lg:grid-cols-5 xl:grid-cols-6">
      {products.map((product) => {
        const isOutOfStock = product.trackInventory && product.stockQuantity <= 0
        return (
          <button
            key={product.id}
            type="button"
            disabled={isOutOfStock}
            onClick={() => handleClick(product)}
            className={`group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              isOutOfStock ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            }`}
          >
            <div className="relative aspect-square w-full overflow-hidden bg-muted">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Package className="h-8 w-8" />
                </div>
              )}
              {isOutOfStock && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <span className="rounded-md bg-destructive px-2 py-1 text-xs font-semibold text-destructive-foreground">
                    Hết hàng
                  </span>
                </div>
              )}
              {product.hasVariants && !isOutOfStock && (
                <div className="absolute bottom-1 right-1">
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                    Nhiều loại
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col p-2">
              <p className="line-clamp-2 text-xs font-medium leading-tight text-foreground sm:text-sm">
                {product.name}
              </p>
              <p className="mt-auto pt-1 font-mono text-xs font-semibold text-primary sm:text-sm">
                {formatVndWithSuffix(product.basePrice)}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
