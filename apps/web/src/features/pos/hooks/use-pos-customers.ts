import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { listCustomersApi } from '@/features/customers/customers-api'
import { isBrowserOffline, isUnreachableError, searchCustomersOffline } from '@/lib/offline-catalog'

export interface PosCustomerOption {
  id: string
  name: string
  code: string
  phone: string | null
  groupId: string | null
  groupName: string | null
}

/** OFF-09: tìm khách cho POS; không tới được máy chủ thì tìm trên bản sao danh mục */
export async function searchPosCustomers(search: string): Promise<PosCustomerOption[]> {
  if (isBrowserOffline()) return searchCustomersOffline(search)
  try {
    const res = await listCustomersApi({ search: search || undefined, pageSize: 10 })
    return res.data
  } catch (error) {
    if (isUnreachableError(error)) return searchCustomersOffline(search)
    throw error
  }
}

export function usePosCustomerSearch(search: string) {
  return useQuery({
    // Nằm dưới khóa 'customers' để tạo hay sửa khách thì danh sách này cũng làm mới
    queryKey: ['customers', 'pos-search', search],
    queryFn: () => searchPosCustomers(search),
    placeholderData: keepPreviousData,
    networkMode: 'always',
  })
}
