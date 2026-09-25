import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../../db/index.js'

interface LedgerGapRow extends Record<string, unknown> {
  customer_id: string
  current_debt: number
  debt_remaining: number
}

interface DebtRowGap extends Record<string, unknown> {
  id: string
  amount: number
  paid: number
  reduced: number
  remaining: number
}

async function rows<T>(db: Db, query: ReturnType<typeof sql>): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows?: T[] } | T[]
  return Array.isArray(result) ? result : (result.rows ?? [])
}

/**
 * Bất biến công nợ (R3): với mọi khách, `current_debt = sum(debts.remaining)`, và mỗi khoản nợ
 * `amount = paid + reduced + remaining`. Gọi sau mỗi test có đụng tới tiền nợ.
 */
export async function expectDebtLedgerConsistent(db: Db, storeId: string) {
  const gaps = await rows<LedgerGapRow>(
    db,
    sql`
      SELECT c.id AS customer_id, c.current_debt::bigint AS current_debt,
             COALESCE(SUM(d.remaining), 0)::bigint AS debt_remaining
      FROM customers c
      LEFT JOIN debts d ON d.customer_id = c.id AND d.store_id = c.store_id
      WHERE c.store_id = ${storeId}
      GROUP BY c.id, c.current_debt
      HAVING c.current_debt <> COALESCE(SUM(d.remaining), 0)
    `,
  )
  expect(gaps).toEqual([])

  const badRows = await rows<DebtRowGap>(
    db,
    sql`
      SELECT id, amount, paid, reduced, remaining FROM debts
      WHERE store_id = ${storeId}
        AND (amount <> paid + reduced + remaining
          OR (type = 'opening' AND amount < 0
            AND (paid <> 0 OR reduced > 0 OR remaining > 0 OR remaining < amount))
          OR (NOT (type = 'opening' AND amount < 0)
            AND (remaining < 0 OR paid < 0 OR reduced < 0)))
    `,
  )
  expect(badRows).toEqual([])
}

/**
 * Fixture cũ tạo khách với `currentDebt` sẵn mà không có khoản nợ. Sổ công nợ (R3) không cho
 * trạng thái đó, nên ghi phần chênh thành một khoản nợ đầu kỳ, giống dữ liệu thật sau migration
 * điền ngược. Gọi ngay sau khi chèn khách trong setup.
 */
export async function seedOpeningDebtsForFixtureCustomers(db: Db, storeId: string) {
  await db.execute(sql`
    INSERT INTO debts (id, store_id, customer_id, type, amount, paid, reduced, remaining)
    SELECT gen_random_uuid(), c.store_id, c.id, 'opening',
           c.current_debt - COALESCE(s.remaining, 0), 0, 0, c.current_debt - COALESCE(s.remaining, 0)
    FROM customers c
    LEFT JOIN (
      SELECT customer_id, SUM(remaining) AS remaining FROM debts
      WHERE store_id = ${storeId} GROUP BY customer_id
    ) s ON s.customer_id = c.id
    WHERE c.store_id = ${storeId} AND c.current_debt > COALESCE(s.remaining, 0)
  `)
}
