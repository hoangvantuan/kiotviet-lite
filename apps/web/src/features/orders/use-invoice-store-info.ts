import { useMemo } from 'react'

import { usePrintSettingsQuery } from '@/features/settings/use-print-settings'
import { useStoreQuery } from '@/features/settings/use-store-settings'

import type { InvoiceStoreInfo } from './order-invoice-template'

/**
 * BC-03: thông tin cửa hàng in trên hóa đơn lấy từ cài đặt cửa hàng (tên, địa chỉ, SĐT) và
 * cài đặt in (khẩu hiệu). Mọi nơi in hóa đơn dùng chung hook này, không tự ghép từ tài khoản
 * đang đăng nhập (trước đây in tên nhân viên vào chỗ tên cửa hàng).
 */
export function useInvoiceStoreInfo(): InvoiceStoreInfo {
  const store = useStoreQuery().data
  const slogan = usePrintSettingsQuery().data?.slogan
  return useMemo(
    () => ({
      name: store?.name ?? null,
      address: store?.address ?? null,
      phone: store?.phone ?? null,
      slogan: slogan ?? null,
    }),
    [store?.name, store?.address, store?.phone, slogan],
  )
}
