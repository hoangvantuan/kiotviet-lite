import { useCallback } from 'react'
import { ilike } from 'drizzle-orm'

import { products } from '@kiotviet-lite/shared/schema'

import { getPGliteDB } from '@/lib/pglite'
import { useOfflineStore } from '@/stores/use-offline-store'

export function useOfflineSearch() {
  const isOffline = useOfflineStore((s) => s.status === 'offline')

  const searchOffline = useCallback(
    async (term: string) => {
      if (!isOffline || !term.trim()) return []

      const db = getPGliteDB()
      const results = await db
        .select()
        .from(products)
        .where(ilike(products.name, `%${term}%`))
        .limit(20)

      return results
    },
    [isOffline],
  )

  return { isOffline, searchOffline }
}
