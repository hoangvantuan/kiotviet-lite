import { useEffect } from 'react'

interface UsePosKeyboardOptions {
  onPayment: () => void
  onNewOrder: () => void
  onFocusSearch: () => void
  enabled?: boolean
}

export function usePosKeyboard({
  onPayment,
  onNewOrder,
  onFocusSearch,
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
          e.preventDefault() // Block browser default, disabled feature
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
  }, [onPayment, onNewOrder, onFocusSearch, enabled])
}
