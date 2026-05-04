import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { PrintSettingsResponse, UpdatePrintSettingsInput } from '@kiotviet-lite/shared'

import { getPrintSettingsApi, updatePrintSettingsApi } from './print-settings-api'

const PRINT_SETTINGS_KEY = ['print-settings'] as const

export const DEFAULT_PRINT_SETTINGS: PrintSettingsResponse = {
  id: null,
  storeId: '',
  logoUrl: null,
  slogan: null,
  defaultPaperSize: '58mm',
  showOldDebt: false,
  showNewDebt: true,
  showCostPrice: false,
  showDiscount: true,
  showNotes: true,
  showCustomerName: true,
  showCustomerPhone: true,
  showSku: false,
  footerText: 'Cảm ơn quý khách!',
}

export function usePrintSettingsQuery() {
  return useQuery({
    queryKey: PRINT_SETTINGS_KEY,
    queryFn: async () => (await getPrintSettingsApi()).data,
  })
}

export function useUpdatePrintSettingsMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdatePrintSettingsInput) => updatePrintSettingsApi(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRINT_SETTINGS_KEY })
    },
  })
}
