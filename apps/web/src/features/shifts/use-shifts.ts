import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { CloseShiftInput, OpenShiftInput } from '@kiotviet-lite/shared'

import { useDocumentMutation } from '@/hooks/use-document-mutation'
import { ApiClientError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/use-auth-store'

import { closeShiftApi, getCurrentShiftApi, getShiftApi, openShiftApi } from './shifts-api'

export const SHIFTS_KEY = ['shifts'] as const

/** Ca đang mở của người dùng hiện tại, kèm cờ cửa hàng có dùng ca hay không (POS-06). */
export function useCurrentShiftQuery() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: [...SHIFTS_KEY, 'current', user?.storeId, user?.id],
    queryFn: async () => (await getCurrentShiftApi()).data,
    enabled: !!user,
    // Số liệu ca đổi theo từng đơn: mở hộp đóng ca luôn lấy số mới
    staleTime: 0,
  })
}

export function useShiftQuery(id: string | null | undefined) {
  return useQuery({
    queryKey: [...SHIFTS_KEY, 'detail', id],
    queryFn: async () => (await getShiftApi(id as string)).data,
    enabled: !!id,
  })
}

export function useOpenShiftMutation() {
  const qc = useQueryClient()
  return useDocumentMutation({
    intent: 'shift.open',
    mutationFn: (input: OpenShiftInput, idempotencyKey) => openShiftApi(input, idempotencyKey),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: SHIFTS_KEY })
    },
  })
}

export function useCloseShiftMutation() {
  const qc = useQueryClient()
  return useDocumentMutation({
    intent: 'shift.close',
    instance: ({ shiftId }: { shiftId: string; input: CloseShiftInput }) => shiftId,
    mutationFn: ({ shiftId, input }, idempotencyKey) =>
      closeShiftApi(shiftId, input, idempotencyKey),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: SHIFTS_KEY })
      qc.invalidateQueries({ queryKey: ['cash-reports'] })
    },
  })
}

/** Máy chủ từ chối bán vì cửa hàng dùng ca mà người bán chưa mở ca. */
export function isShiftRequiredError(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.details as { reason?: string } | undefined)?.reason === 'shift_required'
  )
}
