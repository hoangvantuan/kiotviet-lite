import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { CreateOrderInput, DebtInfo, PriceSource } from '@kiotviet-lite/shared'

import { useDocumentMutation } from '@/hooks/use-document-mutation'
import { apiClient, ApiClientError } from '@/lib/api-client'
import { idempotencyKeyFor } from '@/lib/idempotency'
import { getCustomerDebtOffline, isBrowserOffline, isUnreachableError } from '@/lib/offline-catalog'
import { offlineOrderNumber, saveOfflineOrder } from '@/lib/offline-orders'
import { getOfflineDB } from '@/lib/pglite'
import { useAuthStore } from '@/stores/use-auth-store'
import { useOfflineStore } from '@/stores/use-offline-store'

import { POS_ORDER_INTENT } from '../constants'
import type { OrderDetail, StockInfo } from '../types'

interface CheckoutPayload {
  customerId?: string | null
  priceListId?: string | null
  priceListName?: string | null
  subtotal: number
  discountType: string | null
  discountValue: number
  discountAmount: number
  total: number
  paymentMethod: string
  paymentStatus?: string
  cashAmount?: number
  transferAmount?: number
  debtAmount?: number
  debtLimitOverridden?: boolean
  debtLimitOverridePin?: string
  debtLimitApproverId?: string
  priceOverridePin?: string
  priceApproverId?: string
  note?: string | null
  items: {
    productId: string
    variantId: string | null
    productName: string
    variantName: string | null
    unit: string | null
    unitPrice: number
    quantity: number
    discountType: string | null
    discountValue: number
    discountAmount: number
    lineTotal: number
    note: string | null
    unitConversionId: string | null
    originalPrice?: number | null
    priceOverride?: boolean
    priceOverrideReason?: string | null
    priceOverridePinUsed?: boolean
    priceSource?: PriceSource | null
    priceSourceDetail?: string | null
  }[]
}

export interface CheckoutVariables {
  /** Tab giỏ hàng đang thanh toán: mỗi tab là một ý định bán, giữ khóa riêng */
  tab: number
  order: CheckoutPayload
}

interface CheckoutResponse {
  data: OrderDetail
}

interface StockInfoResponse {
  data: StockInfo
}

interface CustomerDebtResponse {
  data: DebtInfo
}

/** Mã lỗi khi lần bán trước (cùng khóa) có vẻ đã được lưu: `details` là {@link PreviousOrderSaved} */
export const PREVIOUS_ORDER_SAVED = 'PREVIOUS_ORDER_SAVED'

/** R4: lỗi mạng giữa chừng, đơn đã chuyển sang hàng chờ trên máy với cùng mã */
export const OFFLINE_UNKNOWN_OUTCOME_MESSAGE =
  'Chưa rõ máy chủ đã nhận đơn hay chưa. Đơn được giữ trên máy với cùng mã, khi có mạng sẽ đối chiếu và không tạo đơn trùng.'

/** Thêm vào thông báo "chưa rõ" của R4 để thu ngân biết lần bấm lại sẽ ra sao */
export const UNKNOWN_OUTCOME_RETRY_HINT =
  'Nếu vẫn không tới được máy chủ, đơn sẽ được giữ trên máy với cùng mã.'

/**
 * OFF-06: khóa của các lần bán đã gặp kết quả không rõ. Lần đầu đi luồng "chưa rõ" của R4 (hộp
 * thanh toán giữ nguyên để bấm lại cùng khóa); bấm lại mà vẫn không tới được máy chủ thì chuyển
 * sang hàng chờ trên máy, để máy chủ treo không giữ chân thu ngân.
 */
const unknownOutcomeKeys = new Set<string>()

export interface PreviousOrderSaved {
  orderId: string
  orderNumber: string
}

/**
 * Phần của đơn quyết định khóa: hàng, khách, bảng giá, chiết khấu, tổng. Không gồm cách trả tiền,
 * tiền khách đưa, PIN hay người duyệt: đóng rồi mở lại hộp thanh toán thì các ô này bị đặt lại,
 * thu ngân nhập lại khác đi (chọn mệnh giá khác, đổi sang chuyển khoản) vẫn là cùng một lần bán.
 */
export function checkoutFingerprint({ tab, order }: CheckoutVariables) {
  return {
    tab,
    customerId: order.customerId ?? null,
    priceListId: order.priceListId ?? null,
    subtotal: order.subtotal,
    discountType: order.discountType,
    discountValue: order.discountValue,
    discountAmount: order.discountAmount,
    total: order.total,
    items: order.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      unitConversionId: item.unitConversionId,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      discountType: item.discountType,
      discountValue: item.discountValue,
      discountAmount: item.discountAmount,
      lineTotal: item.lineTotal,
    })),
  }
}

/**
 * POS-07: khóa mà lần thanh toán tới của tab sẽ gửi (cùng ý định, tab, dấu vân tay với
 * useCheckoutMutation), để in mã tạm vào nội dung chuyển khoản trước khi bấm hoàn tất. Khóa này
 * là clientId của đơn, nên sao kê ngân hàng tra ngược ra được đơn.
 */
export function pendingCheckoutKey(variables: CheckoutVariables): string {
  return idempotencyKeyFor(`${POS_ORDER_INTENT}:${variables.tab}`, checkoutFingerprint(variables))
}

function isKeyReused(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.details as { reason?: string } | undefined)?.reason === 'idempotency_key_reused'
  )
}

/**
 * Cùng khóa nhưng phần trả tiền khác lần trước: máy chủ từ chối (422) vì lần trước đã lưu. Tra đơn
 * theo clientId để thu ngân mở ra kiểm tra thay vì bán lại. Không tìm thấy thì trả lỗi gốc (hook
 * bỏ khóa, lần sau là đơn mới).
 */
async function previousOrderError(clientId: string, original: unknown): Promise<unknown> {
  try {
    const res = await apiClient.get<{ data: Array<{ id: string; orderNumber: string }> }>(
      `/api/v1/orders?clientId=${clientId}&pageSize=1`,
    )
    const order = res.data[0]
    if (!order) return original
    const details: PreviousOrderSaved = { orderId: order.id, orderNumber: order.orderNumber }
    return new ApiClientError(422, {
      code: PREVIOUS_ORDER_SAVED,
      message: `Đơn trước có thể đã được lưu (${order.orderNumber}). Mở đơn để kiểm tra trước khi bán lại, nếu đúng thì xóa giỏ hàng này.`,
      details,
    })
  } catch {
    return original
  }
}

export function useCheckoutMutation() {
  const qc = useQueryClient()
  return useDocumentMutation({
    intent: POS_ORDER_INTENT,
    instance: ({ tab }: CheckoutVariables) => String(tab),
    fingerprint: checkoutFingerprint,
    // R4 (OFF-07): khóa của lần bán cũng là clientId của đơn, dùng chung cho request trực tuyến
    // và hàng chờ ngoại tuyến. Mất phản hồi rồi lưu lại (trực tuyến hay ngoại tuyến) vẫn ra một đơn.
    mutationFn: async ({ order }: CheckoutVariables, clientId) => {
      const payload = { ...order, clientId }
      const isOffline =
        useOfflineStore.getState().status === 'offline' ||
        (typeof navigator !== 'undefined' && !navigator.onLine)

      // OFF-06: lưu vào hàng chờ trên máy bằng CHÍNH clientId của lần bán. `unknown` là khi request
      // đã gửi mà không có phản hồi: máy chủ có thể đã lưu, /sync/push nhận ra trùng clientId nên
      // vẫn chỉ ra một đơn.
      const saveOffline = async (unknown: boolean) => {
        const pglite = await getOfflineDB()

        const seller = useAuthStore.getState().user
        if (!seller) throw new Error('Chưa đăng nhập')

        // OFF-05: đơn nhớ người bán và cửa hàng lúc bán. OFF-13: PIN duyệt bị bỏ trước khi ghi.
        await saveOfflineOrder(
          pglite,
          { storeId: seller.storeId, userId: seller.id },
          payload as CreateOrderInput,
          clientId,
        )
        if (unknown) {
          toast.warning(OFFLINE_UNKNOWN_OUTCOME_MESSAGE)
        } else {
          toast.success('Đơn hàng đã lưu (ngoại tuyến, chờ đồng bộ)')
        }

        const debtAmount = payload.debtAmount ?? 0
        let change = 0
        if (payload.paymentMethod === 'cash' && payload.cashAmount != null) {
          change = Math.max(0, payload.cashAmount - payload.total)
        } else if (payload.paymentMethod === 'combined') {
          const cashPart = payload.cashAmount ?? 0
          const transferPart = payload.transferAmount ?? 0
          change = Math.max(0, cashPart + transferPart - payload.total)
        } else if (payload.paymentMethod === 'debt' && payload.cashAmount != null) {
          change = Math.max(0, payload.cashAmount - (payload.total - debtAmount))
        }

        const offlineOrder: OrderDetail = {
          id: clientId,
          // OFF-17: mã tạm có tiền tố rõ ràng, máy chủ cấp mã thật khi đồng bộ
          orderNumber: offlineOrderNumber(clientId),
          customerId: payload.customerId ?? null,
          priceListId: payload.priceListId ?? null,
          priceListName: payload.priceListName ?? null,
          subtotal: payload.subtotal,
          discountAmount: payload.discountAmount,
          total: payload.total,
          paymentMethod: payload.paymentMethod,
          paymentStatus:
            payload.paymentStatus ??
            (debtAmount > 0 ? (debtAmount === payload.total ? 'unpaid' : 'partial') : 'paid'),
          cashAmount: payload.cashAmount ?? null,
          transferAmount: payload.transferAmount ?? null,
          debtAmount,
          change,
          note: payload.note ?? null,
          status: 'completed',
          items: payload.items.map((item, idx) => ({
            id: `offline-item-${idx}`,
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            variantName: item.variantName,
            unit: item.unit,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            discountType: item.discountType,
            discountValue: item.discountValue,
            discountAmount: item.discountAmount,
            lineTotal: item.lineTotal,
            originalPrice: item.originalPrice ?? null,
            priceOverride: item.priceOverride ?? false,
            sku: null,
            costPrice: null,
            priceSource: item.priceSource ?? 'retail_price',
            priceSourceDetail: item.priceSourceDetail ?? null,
          })),
          createdAt: new Date().toISOString(),
          oldDebt: null,
          customerCurrentDebt: null,
        }

        return { data: offlineOrder }
      }

      if (isOffline) return saveOffline(false)

      try {
        const res = await apiClient.post<CheckoutResponse>('/api/v1/pos/orders', payload, {
          idempotencyKey: clientId,
        })
        unknownOutcomeKeys.delete(clientId)
        return res
      } catch (error) {
        if (isUnreachableError(error)) {
          const apiError = error as ApiClientError
          const unknown =
            (apiError.details as { outcomeUnknown?: boolean } | undefined)?.outcomeUnknown === true
          // Lần đầu không rõ kết quả mà máy vẫn báo có mạng: luồng "chưa rõ" của R4
          if (unknown && !unknownOutcomeKeys.has(clientId) && !isBrowserOffline()) {
            unknownOutcomeKeys.add(clientId)
            throw new ApiClientError(
              apiError.status,
              {
                code: apiError.code,
                message: `${apiError.message} ${UNKNOWN_OUTCOME_RETRY_HINT}`,
                details: apiError.details,
              },
              null,
            )
          }
          try {
            const saved = await saveOffline(unknown)
            unknownOutcomeKeys.delete(clientId)
            return saved
          } catch (saveError) {
            // Không ghi được vào máy thì trả lại lỗi mạng gốc: thu ngân lưu lại cùng khóa (R4)
            console.error('Không lưu được đơn vào hàng chờ ngoại tuyến', saveError)
            throw error
          }
        }
        throw isKeyReused(error) ? await previousOrderError(clientId, error) : error
      }
    },
    onSuccess: (_data, { order: variables }) => {
      qc.invalidateQueries({ queryKey: ['pos-products'] })
      qc.invalidateQueries({ queryKey: ['low-stock-count'] })
      qc.invalidateQueries({ queryKey: ['low-stock-list'] })
      if (variables.customerId) {
        qc.invalidateQueries({ queryKey: ['customer-debt', variables.customerId] })
      }
    },
  })
}

/** Nợ của khách; `syncedAt` có giá trị khi số liệu lấy từ bản sao trên máy (ngoại tuyến) */
export type CustomerDebtView = DebtInfo & { syncedAt?: string; pendingDebt?: number }

async function fetchCustomerDebt(customerId: string): Promise<CustomerDebtView | null> {
  // OFF-15: không tới được máy chủ thì dùng nợ và hạn mức theo lần đồng bộ gần nhất
  if (isBrowserOffline()) return getCustomerDebtOffline(customerId)
  try {
    const res = await apiClient.get<CustomerDebtResponse>(`/api/v1/pos/customer-debt/${customerId}`)
    return res.data
  } catch (error) {
    if (isUnreachableError(error)) return getCustomerDebtOffline(customerId)
    throw error
  }
}

// Story 5.1: customer debt info query
export function useCustomerDebtQuery(customerId: string | null) {
  return useQuery({
    queryKey: ['customer-debt', customerId],
    queryFn: () => fetchCustomerDebt(customerId!),
    enabled: customerId !== null,
    staleTime: 0,
    // Ngoại tuyến vẫn chạy để đọc bản sao cục bộ
    networkMode: 'always',
  })
}

export function useStockInfoQuery(productId: string | null) {
  return useQuery({
    queryKey: ['stock-info', productId],
    queryFn: () => apiClient.get<StockInfoResponse>(`/api/v1/pos/stock/${productId}`),
    enabled: productId !== null,
    staleTime: 0, // Always fresh
    select: (res) => res.data,
  })
}
