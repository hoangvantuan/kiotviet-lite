import { useCallback, useEffect, useMemo } from 'react'
import {
  type MutationKey,
  useMutation,
  type UseMutationOptions,
  useQueryClient,
} from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'

import { ApiClientError } from '@/lib/api-client'
import { idempotencyKeyFor, releaseIdempotencyKey } from '@/lib/idempotency'

type DocumentMutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  'mutationFn' | 'mutationKey' | 'networkMode' | 'scope'
> & {
  /** Ý định lưu, ví dụ 'receipt.create' hay `pos.order:${tab}`: mỗi ý định giữ một khóa */
  intent: string
  /** Tách khóa trong cùng một ý định, ví dụ theo tab bán hàng: `(v) => String(v.tab)` */
  instance?: (variables: TVariables) => string
  mutationFn: (variables: TVariables, idempotencyKey: string) => Promise<TData>
}

export type DocumentMutation<TData, TVariables> = ReturnType<
  typeof useDocumentMutation<TData, TVariables>
>

function isKeyRejected(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.details as { reason?: string } | undefined)?.reason === 'idempotency_key_reused'
  )
}

/**
 * R4 (POS-02, TIEN-04, KHO-08): mutation tạo chứng từ dùng chung.
 *
 * - Mỗi lần lưu gửi kèm Idempotency-Key lấy theo `intent` và nội dung (xem lib/idempotency):
 *   bấm lưu lại sau khi mất phản hồi không tạo chứng từ thứ hai.
 * - `networkMode: 'always'`: không tạm dừng mutation khi trình duyệt báo mất mạng, để request
 *   thất bại ngay và người dùng thấy thông báo, thay vì treo rồi tự gửi khi có mạng lại.
 * - `discard()` dùng khi người dùng hủy: xóa mutation còn tạm dừng của ý định này khỏi
 *   MutationCache để nó không tự gửi về sau.
 */
export function useDocumentMutation<TData, TVariables>({
  intent,
  instance,
  mutationFn,
  ...options
}: DocumentMutationOptions<TData, TVariables>) {
  const queryClient = useQueryClient()
  const mutationKey = useMemo<MutationKey>(() => ['document', intent], [intent])

  const mutation = useMutation<TData, Error, TVariables>({
    ...options,
    mutationKey,
    networkMode: 'always',
    mutationFn: async (variables) => {
      const scope = instance ? `${intent}:${instance(variables)}` : intent
      const key = idempotencyKeyFor(scope, variables)
      try {
        const result = await mutationFn(variables, key)
        releaseIdempotencyKey(scope, key)
        return result
      } catch (error) {
        // Khóa đã gắn với nội dung khác ở máy chủ (hiếm, ví dụ đổi tài khoản): lần sau sinh khóa mới
        if (isKeyRejected(error)) releaseIdempotencyKey(scope, key)
        throw error
      }
    },
  })

  const discard = useCallback(() => {
    const cache = queryClient.getMutationCache()
    for (const pending of cache.findAll({ mutationKey, exact: true })) {
      if (pending.state.isPaused) cache.remove(pending)
    }
  }, [queryClient, mutationKey])

  return { ...mutation, discard, mutationKey }
}

type GuardedMutation = Pick<
  DocumentMutation<unknown, never>,
  'isPending' | 'discard' | 'mutationKey'
>

/**
 * Đọc thẳng MutationCache thay vì `isPending` của lần render trước: ngay sau khi lưu xong, form
 * đóng hoặc chuyển trang trước khi React kịp render lại, lúc đó không được chặn.
 */
function useIsSaving(mutationKey: MutationKey) {
  const queryClient = useQueryClient()
  return useCallback(
    () => queryClient.isMutating({ mutationKey, exact: true }) > 0,
    [queryClient, mutationKey],
  )
}

/**
 * Không cho đóng hộp thoại khi đang lưu: đóng giữa chừng thì người dùng không biết chứng từ đã
 * lưu chưa. Trả về hàm thay cho `onOpenChange` của Dialog; khi không lưu nữa thì đóng bình
 * thường và dọn mutation tạm dừng. Kèm chặn tải lại hoặc đóng thẻ trình duyệt.
 */
export function useGuardedOpenChange(
  onOpenChange: (open: boolean) => void,
  mutation: GuardedMutation,
) {
  const { isPending, discard, mutationKey } = mutation
  const isSaving = useIsSaving(mutationKey)
  useBeforeUnloadWhile(isPending)
  return useCallback(
    (open: boolean) => {
      if (!open && isSaving()) return
      if (!open) discard()
      onOpenChange(open)
    },
    [isSaving, discard, onOpenChange],
  )
}

/** Form dạng trang: chặn rời trang (điều hướng trong ứng dụng, tải lại, đóng thẻ) khi đang lưu. */
export function useBlockNavigationWhileSaving(mutation: GuardedMutation) {
  const isSaving = useIsSaving(mutation.mutationKey)
  useBlocker({ shouldBlockFn: isSaving, enableBeforeUnload: isSaving })
  useEffect(() => mutation.discard, [mutation.discard])
}

function useBeforeUnloadWhile(active: boolean) {
  useEffect(() => {
    if (!active) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [active])
}
