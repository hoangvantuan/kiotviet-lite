import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, ScanBarcode, Search } from 'lucide-react'

import { useMediaQuery } from '@/hooks/use-media-query'
import { formatVndWithSuffix } from '@/lib/currency'
import { useCartStore } from '@/stores/use-cart-store'

import { usePosSearch } from '../hooks/use-pos-products'
import type { PosProductItem } from '../types'

interface PosSearchBarProps {
  searchRef?: React.RefObject<HTMLInputElement | null>
  onOpenScanner: () => void
  onSelectProduct: (product: PosProductItem) => void
}

export function PosSearchBar({ searchRef, onOpenScanner, onSelectProduct }: PosSearchBarProps) {
  const [inputValue, setInputValue] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const isMobile = !useMediaQuery('(min-width: 768px)')
  const mode = useCartStore((s) => s.mode)
  const addItem = useCartStore((s) => s.addItem)

  const { data: results, isFetching } = usePosSearch(debouncedQuery)

  // Debounce input
  useEffect(() => {
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(inputValue.trim())
    }, 150)
    return () => clearTimeout(debounceTimerRef.current)
  }, [inputValue])

  // Open dropdown when results arrive
  useEffect(() => {
    if (results && results.length > 0 && debouncedQuery.length > 0) {
      setIsOpen(true)
      setHighlightIndex(-1)
    } else if (debouncedQuery.length === 0) {
      setIsOpen(false)
    }
  }, [results, debouncedQuery])

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSelect = useCallback(
    (product: PosProductItem) => {
      const isOutOfStock = product.trackInventory && product.stockQuantity <= 0
      if (isOutOfStock) return

      if (product.hasVariants || mode === 'normal') {
        onSelectProduct(product)
      } else {
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
      }

      setInputValue('')
      setDebouncedQuery('')
      setIsOpen(false)
      inputRef.current?.focus()
    },
    [mode, addItem, onSelectProduct],
  )

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || !results) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
    } else if (e.key === 'Enter' && highlightIndex >= 0 && results[highlightIndex]) {
      e.preventDefault()
      handleSelect(results[highlightIndex])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={(el) => {
            ;(inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el
            if (searchRef)
              (searchRef as React.MutableRefObject<HTMLInputElement | null>).current = el
          }}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results && results.length > 0 && debouncedQuery.length > 0) {
              setIsOpen(true)
            }
          }}
          placeholder="Tìm sản phẩm, mã SKU, barcode..."
          className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-12 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        {isFetching && (
          <Loader2 className="absolute right-12 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {isMobile && (
          <button
            type="button"
            onClick={onOpenScanner}
            className="absolute right-1 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Quét mã vạch"
          >
            <ScanBarcode className="h-5 w-5" />
          </button>
        )}
      </div>

      {isOpen && results && results.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {results.map((product, index) => {
            const isOutOfStock = product.trackInventory && product.stockQuantity <= 0
            return (
              <li key={product.id}>
                <button
                  type="button"
                  disabled={isOutOfStock}
                  onClick={() => handleSelect(product)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    index === highlightIndex ? 'bg-accent' : 'hover:bg-accent/50'
                  } ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                        SP
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.sku}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-semibold text-foreground">
                      {formatVndWithSuffix(product.basePrice)}
                    </p>
                    {product.trackInventory && (
                      <p
                        className={`text-xs ${
                          product.stockQuantity <= 0
                            ? 'text-destructive'
                            : product.stockQuantity <= 10
                              ? 'text-yellow-600'
                              : 'text-muted-foreground'
                        }`}
                      >
                        Tồn: {product.stockQuantity}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {isOpen && debouncedQuery.length > 0 && results && results.length === 0 && !isFetching && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover p-4 text-center text-sm text-muted-foreground shadow-lg">
          Không tìm thấy sản phẩm
        </div>
      )}
    </div>
  )
}
