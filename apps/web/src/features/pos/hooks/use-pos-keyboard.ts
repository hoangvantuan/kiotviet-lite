import { useEffect } from 'react'

interface UsePosKeyboardOptions {
  onPayment: () => void
  onNewOrder: () => void
  onFocusSearch: () => void
  onDebtPayment: () => void
  enabled?: boolean
}

export function usePosKeyboard({
  onPayment,
  onNewOrder,
  onFocusSearch,
  onDebtPayment,
  enabled = true,
}: UsePosKeyboardOptions) {
  useEffect(() => {
    if (!enabled) return

    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA'

      switch (e.key) {
        case 'F2':
          e.preventDefault()
          onPayment()
          break
        case 'F4':
          // Story 5.1: F4 mở payment dialog với tab Ghi nợ
          e.preventDefault()
          onDebtPayment()
          break
        case 'F5':
          e.preventDefault() // Block browser refresh!
          onNewOrder()
          break
        case 'Escape':
          // Esc handled by Dialog/Sheet natively via onOpenChange
          break
        case 'f':
          if ((e.ctrlKey || e.metaKey) && !isInput) {
            e.preventDefault()
            onFocusSearch()
          }
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onPayment, onNewOrder, onFocusSearch, onDebtPayment, enabled])
}
