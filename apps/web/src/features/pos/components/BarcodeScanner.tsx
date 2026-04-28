import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { apiClient } from '@/lib/api-client'
import { showWarning } from '@/lib/toast'
import { useCartStore } from '@/stores/use-cart-store'

import type { PosProductItem } from '../types'

interface BarcodeScannerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectProduct: (product: PosProductItem) => void
}

interface PosSearchResponse {
  data: PosProductItem[]
}

export function BarcodeScanner({ open, onOpenChange, onSelectProduct }: BarcodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null)
  const containerId = 'pos-barcode-reader'
  const mode = useCartStore((s) => s.mode)
  const addItem = useCartStore((s) => s.addItem)

  const processingRef = useRef(false)
  const modeRef = useRef(mode)
  const addItemRef = useRef(addItem)
  modeRef.current = mode
  addItemRef.current = addItem

  const handleScan = useCallback(
    async (barcode: string) => {
      if (processingRef.current) return
      processingRef.current = true

      try {
        // Stop scanner during lookup
        try {
          const scanner = scannerRef.current
          if (scanner && scanner.getState() === 2) {
            await scanner.stop()
          }
        } catch {
          // Ignore
        }

        const result = await apiClient.get<PosSearchResponse>(
          `/api/v1/pos/products/search?q=${encodeURIComponent(barcode)}`,
        )
        const products = result.data
        if (products.length === 0) {
          showWarning(`Không tìm thấy sản phẩm với mã: ${barcode}`)
          onOpenChange(false)
          return
        }

        const exactMatch = products.find((p) => p.barcode === barcode)
        const product = exactMatch ?? products[0]!
        const isOutOfStock = product.trackInventory && product.stockQuantity <= 0
        if (isOutOfStock) {
          showWarning(`Sản phẩm "${product.name}" đã hết hàng`)
          onOpenChange(false)
          return
        }

        if (product.hasVariants) {
          onOpenChange(false)
          onSelectProduct(product)
        } else if (modeRef.current === 'quick') {
          addItemRef.current({
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
          onOpenChange(false)
        } else {
          onOpenChange(false)
          onSelectProduct(product)
        }
      } catch {
        showWarning('Lỗi khi tìm sản phẩm. Vui lòng thử lại.')
        onOpenChange(false)
      } finally {
        processingRef.current = false
      }
    },
    [onOpenChange, onSelectProduct],
  )

  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function startScanner() {
      // Small delay for DOM to mount
      await new Promise((r) => setTimeout(r, 300))
      if (cancelled) return

      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        const scanner = new Html5Qrcode(containerId)
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            aspectRatio: 1.5,
          },
          (decodedText) => {
            handleScan(decodedText)
          },
          undefined,
        )

        if (!cancelled) {
          setIsScanning(true)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Không thể truy cập camera'
          setError(msg)
          setIsScanning(false)
        }
      }
    }

    startScanner()

    return () => {
      cancelled = true
      const scanner = scannerRef.current
      if (scanner) {
        try {
          const state = scanner.getState()
          if (state === 2) {
            scanner
              .stop()
              .then(() => scanner.clear())
              .catch(() => {})
          } else {
            scanner.clear()
          }
        } catch {
          // Ignore cleanup errors
        }
        scannerRef.current = null
      }
      setIsScanning(false)
      setError(null)
    }
  }, [open, handleScan])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Quét mã vạch</DialogTitle>
          <DialogDescription>Hướng camera vào mã vạch của sản phẩm</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div
            id={containerId}
            className="mx-auto aspect-video w-full overflow-hidden rounded-lg bg-muted"
          />

          {!isScanning && !error && (
            <p className="text-center text-sm text-muted-foreground">Đang khởi tạo camera...</p>
          )}

          {error && (
            <div className="space-y-2 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Đóng
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
