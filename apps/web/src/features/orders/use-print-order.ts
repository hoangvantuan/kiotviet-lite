import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import * as serial from '@/lib/serial-port'
import {
  buildOrderReceipt,
  type PaperWidth,
  type PrintOptions,
  type ThermalOrder,
  type ThermalStoreInfo,
} from '@/lib/thermal-printer'
import { usePrintStore } from '@/stores/use-print-store'

export type PrintFormat = 'thermal-58' | 'thermal-80' | 'a4' | 'a5'
export type PrintStatus = 'idle' | 'connecting' | 'printing' | 'success' | 'error' | 'fallback'

const STORAGE_FORMAT_KEY = 'kv_print_default_format'

const DEFAULT_PRINT_OPTIONS: Omit<PrintOptions, 'paperWidth'> = {
  isReprint: false,
  showOldDebt: false,
  showNewDebt: true,
  showDiscount: true,
  footerText: 'Cảm ơn quý khách!',
}

export function getDefaultFormat(): PrintFormat {
  try {
    const saved = localStorage.getItem(STORAGE_FORMAT_KEY)
    if (saved === 'thermal-58' || saved === 'thermal-80' || saved === 'a4' || saved === 'a5') {
      return saved
    }
  } catch {
    // Ignore
  }
  return 'thermal-58'
}

export function saveDefaultFormat(format: PrintFormat): void {
  try {
    localStorage.setItem(STORAGE_FORMAT_KEY, format)
  } catch {
    // Ignore
  }
}

function paperWidthFromFormat(format: PrintFormat): PaperWidth {
  return format === 'thermal-80' ? '80mm' : '58mm'
}

/** Map PrintFormat sang format dùng cho browser print template */
function browserPrintFormat(format: PrintFormat): PrintFormat {
  // Giữ nguyên format gốc: thermal-58, thermal-80, a4, a5
  return format
}

export interface PrintOrderParams {
  order: ThermalOrder
  store: ThermalStoreInfo
  format?: PrintFormat
  isReprint?: boolean
}

/**
 * Map dữ liệu order (từ API hoặc POS) sang ThermalOrder dùng cho print.
 * Tránh duplicate mapping logic ở nhiều nơi (M3).
 */
export function toThermalOrder(order: {
  orderNumber: string
  createdAt: string
  customerName?: string | null
  customerPhone?: string | null
  items: Array<{
    productName: string
    variantName?: string | null
    unit?: string | null
    quantity: number
    unitPrice: number
    discountAmount: number
    lineTotal: number
  }>
  subtotal: number
  discountAmount: number
  total: number
  paymentMethod: string
  cashAmount?: number | null
  transferAmount?: number | null
  paidAmount: number
  change: number
  debtAmount: number
  note?: string | null
}): ThermalOrder {
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    items: order.items.map((it) => ({
      productName: it.productName,
      variantName: it.variantName,
      unit: it.unit,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discountAmount: it.discountAmount,
      lineTotal: it.lineTotal,
    })),
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    total: order.total,
    paymentMethod: order.paymentMethod,
    cashAmount: order.cashAmount,
    transferAmount: order.transferAmount,
    paidAmount: order.paidAmount,
    change: order.change,
    debtAmount: order.debtAmount,
    note: order.note,
  }
}

export function usePrintOrder() {
  const [status, setStatus] = useState<PrintStatus>('idle')
  const printingRef = useRef(false)
  const setActivePrintFormat = usePrintStore((s) => s.setActivePrintFormat)

  const printThermal = useCallback(async (params: PrintOrderParams) => {
    const { order, store, format = 'thermal-58', isReprint = false } = params

    if (!serial.isSerialSupported()) {
      toast.info('Trình duyệt không hỗ trợ in trực tiếp, đang in qua trình duyệt')
      return false
    }

    setStatus('connecting')

    try {
      let port = await serial.reconnect()

      if (!port) {
        try {
          port = await serial.connect()
        } catch (err) {
          if (err instanceof DOMException && err.name === 'NotFoundError') {
            toast.info('Bạn có thể kết nối máy in sau tại Cài đặt > Máy in')
            return false
          }
          throw err
        }
      }

      setStatus('printing')

      const options: PrintOptions = {
        ...DEFAULT_PRINT_OPTIONS,
        paperWidth: paperWidthFromFormat(format),
        isReprint,
      }

      const buffer = buildOrderReceipt(order, store, options)
      await serial.send(buffer, port)

      setStatus('success')
      toast.success('In hóa đơn thành công')
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'

      if (message.includes('Hết giấy') || message.includes('paper')) {
        toast.error('Hết giấy. Nạp giấy rồi thử lại')
      } else {
        toast.error(`Lỗi in hóa đơn: ${message}`)
      }

      setStatus('error')
      return false
    }
  }, [])

  const printBrowserFallback = useCallback((format: PrintFormat) => {
    setActivePrintFormat(format)
    setStatus('fallback')

    const cleanup = () => {
      setActivePrintFormat(null)
      setStatus('idle')
    }

    // Dùng afterprint event thay vì setTimeout để reset đáng tin hơn (H4)
    window.addEventListener('afterprint', cleanup, { once: true })

    requestAnimationFrame(() => {
      window.print()
    })
  }, [setActivePrintFormat])

  const printOrder = useCallback(async (params: PrintOrderParams) => {
    if (printingRef.current) return
    printingRef.current = true

    try {
      const format = params.format ?? getDefaultFormat()
      const isThermal = format === 'thermal-58' || format === 'thermal-80'

      if (isThermal) {
        const success = await printThermal({ ...params, format })
        if (!success) {
          toast.info('Máy in nhiệt không kết nối, đang in qua trình duyệt')
          // Thermal fallback: giữ format gốc để template biết paper width
          printBrowserFallback(browserPrintFormat(format))
        }
      } else {
        printBrowserFallback(format)
      }

      saveDefaultFormat(format)
    } finally {
      printingRef.current = false
    }
  }, [printThermal, printBrowserFallback])

  const reset = useCallback(() => {
    setStatus('idle')
    setActivePrintFormat(null)
  }, [setActivePrintFormat])

  return {
    status,
    printOrder,
    printBrowserFallback,
    reset,
  }
}
