import { useCallback } from 'react'
import { sql } from 'drizzle-orm'

import { PRODUCT_SEARCH_SOURCE, searchLikePattern, searchTextSql } from '@kiotviet-lite/shared'
import { products } from '@kiotviet-lite/shared/schema'

import { getPGliteDB } from '@/lib/pglite'
import { useOfflineStore } from '@/stores/use-offline-store'

/**
 * Điều kiện tìm ngoại tuyến cùng quy tắc với API (GL-16): bỏ dấu tiếng Việt trên tên và mã.
 * Tính từ cột gốc thay vì products.search_text để không phụ thuộc bảng PGlite có cột sinh.
 */
export function offlineProductSearchCondition(term: string) {
  return sql`${sql.raw(searchTextSql(PRODUCT_SEARCH_SOURCE))} LIKE ${searchLikePattern(term)}`
}

export function useOfflineSearch() {
  const isOffline = useOfflineStore((s) => s.status === 'offline')

  const searchOffline = useCallback(
    async (term: string) => {
      if (!isOffline || !term.trim()) return []

      const db = getPGliteDB()
      const results = await db
        .select()
        .from(products)
        .where(offlineProductSearchCondition(term))
        .limit(20)

      return results
    },
    [isOffline],
  )

  return { isOffline, searchOffline }
}
