import { eq, sql } from 'drizzle-orm'

import { stores } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'

export async function lockCodeStore(db: Db, storeId: string): Promise<void> {
  await db.select({ id: stores.id }).from(stores).where(eq(stores.id, storeId)).for('no key update')
}

export async function nextEntityCode({
  db,
  storeId,
  kind,
  occupied,
}: {
  db: Db
  storeId: string
  kind: 'customer' | 'supplier'
  occupied: (code: string) => Promise<boolean>
}): Promise<string> {
  const counter = kind === 'customer' ? stores.customerCodeCounter : stores.supplierCodeCounter
  const prefix = kind === 'customer' ? 'KH' : 'NCC'

  for (;;) {
    const [row] = await db
      .update(stores)
      .set({
        [kind === 'customer' ? 'customerCodeCounter' : 'supplierCodeCounter']: sql`${counter} + 1`,
      })
      .where(eq(stores.id, storeId))
      .returning({ value: counter })
    if (!row) throw new Error('Store not found while allocating entity code')
    const code = `${prefix}${String(row.value).padStart(6, '0')}`
    if (!(await occupied(code))) return code
  }
}
