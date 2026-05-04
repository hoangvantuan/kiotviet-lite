import { create } from 'zustand'

import type { PrintFormat } from '@/features/orders/use-print-order'

interface PrintState {
  /** Format đang được in qua browser. null = không đang in */
  activePrintFormat: PrintFormat | null
  setActivePrintFormat: (format: PrintFormat | null) => void
}

export const usePrintStore = create<PrintState>((set) => ({
  activePrintFormat: null,
  setActivePrintFormat: (format) => set({ activePrintFormat: format }),
}))
