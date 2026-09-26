import { useEffect, useMemo } from 'react'

import type { StoreSettings } from '@kiotviet-lite/shared'

import { useStoreQuery } from '@/features/settings/use-store-settings'
import type { BankConfig } from '@/lib/vietqr'
import { useAuthStore } from '@/stores/use-auth-store'

/** Phần cài đặt cửa hàng POS cần cả khi mất mạng: tài khoản nhận tiền (POS-07) và bật ca (POS-06). */
export interface PosStoreConfig extends BankConfig {
  shiftsEnabled: boolean
}

const STORAGE_PREFIX = 'kiotviet-pos-store-config:'

function pick(store: StoreSettings): PosStoreConfig {
  return {
    shiftsEnabled: store.shiftsEnabled,
    bankBin: store.bankBin,
    bankAccountNumber: store.bankAccountNumber,
    bankAccountName: store.bankAccountName,
  }
}

export function readCachedPosStoreConfig(storeId: string): PosStoreConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storeId)
    if (!raw) return null
    const saved = JSON.parse(raw) as Partial<PosStoreConfig> | null
    if (!saved || typeof saved !== 'object') return null
    return {
      shiftsEnabled: saved.shiftsEnabled === true,
      bankBin: typeof saved.bankBin === 'string' ? saved.bankBin : null,
      bankAccountNumber:
        typeof saved.bankAccountNumber === 'string' ? saved.bankAccountNumber : null,
      bankAccountName: typeof saved.bankAccountName === 'string' ? saved.bankAccountName : null,
    }
  } catch {
    return null
  }
}

/**
 * Cài đặt cửa hàng cho POS. Có mạng thì lấy từ máy chủ và lưu một bản vào localStorage (chỉ BIN,
 * số tài khoản, tên chủ tài khoản, cờ bật ca: không có dữ liệu nhạy cảm), mất mạng thì dùng bản đã
 * lưu để vẫn sinh được mã VietQR.
 */
export function usePosStoreConfig(): PosStoreConfig | null {
  const storeId = useAuthStore((s) => s.user?.storeId)
  const { data } = useStoreQuery()

  const fresh = useMemo(() => (data ? pick(data) : null), [data])

  useEffect(() => {
    if (!fresh || !storeId) return
    try {
      localStorage.setItem(STORAGE_PREFIX + storeId, JSON.stringify(fresh))
    } catch {
      // Không ghi được localStorage: mất mạng thì chưa có bản lưu, POS hiện hướng dẫn cấu hình
    }
  }, [fresh, storeId])

  return useMemo(
    () => fresh ?? (storeId ? readCachedPosStoreConfig(storeId) : null),
    [fresh, storeId],
  )
}
