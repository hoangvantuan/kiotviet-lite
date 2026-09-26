/**
 * Móc kiểm thử E2E, CHỈ có trong bản `build:e2e` (VITE_E2E_HOOKS=1); bản build thật không có biến
 * này nên Vite loại bỏ cả nhánh nạp tệp này.
 *
 * Bài UAT 07 cần 120 đơn nằm chờ trong PGlite (OFF-10). Bán 120 đơn qua giao diện quá chậm, nên
 * móc này ghi đơn vào hàng chờ bằng đúng hàm POS dùng khi bán ngoại tuyến; phần đồng bộ sau đó
 * vẫn chạy qua runtime thật.
 */
import type { CreateOrderInput } from '@kiotviet-lite/shared'

import { useAuthStore } from '@/stores/use-auth-store'

import { saveOfflineOrder } from './offline-orders'
import { getOfflineDB, getPGliteClient } from './pglite'

export interface KvlE2EHooks {
  seedOfflineOrders: (count: number, orderData: CreateOrderInput) => Promise<string[]>
  /** OFF-04: tab này có phải tab chủ đang mở PGlite không (null nếu chưa mở) */
  offlineDBIsLeader: () => boolean | null
}

export function installE2EHooks(): void {
  const hooks: KvlE2EHooks = {
    async seedOfflineOrders(count, orderData) {
      const user = useAuthStore.getState().user
      if (!user) throw new Error('Chưa đăng nhập')
      const db = await getOfflineDB()
      const ids: string[] = []
      for (let i = 0; i < count; i++) {
        const clientId = crypto.randomUUID()
        await saveOfflineOrder(
          db,
          { storeId: user.storeId, userId: user.id },
          { ...orderData, clientId },
          clientId,
        )
        ids.push(clientId)
      }
      return ids
    },
    offlineDBIsLeader() {
      const client = getPGliteClient() as { isLeader?: boolean } | null
      return client ? (client.isLeader ?? null) : null
    },
  }
  ;(window as unknown as { __kvlE2E: KvlE2EHooks }).__kvlE2E = hooks
}
