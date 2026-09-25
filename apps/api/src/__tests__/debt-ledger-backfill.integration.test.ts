import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import * as schema from '@kiotviet-lite/shared/schema'

import type { Db } from '../db/index.js'
import { expectDebtLedgerConsistent } from './helpers/debt-ledger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../db/migrations')
const reportScript = resolve(__dirname, '../../scripts/debt-ledger-backfill-report.sql')
const BACKFILL_TAG = '0047_debt_ledger_backfill'

const ids = {
  store: '00000000-0000-7000-8000-000000000001',
  owner: '00000000-0000-7000-8000-000000000002',
  gapUp: '00000000-0000-7000-8000-0000000000a1',
  returned: '00000000-0000-7000-8000-0000000000a2',
  gapDown: '00000000-0000-7000-8000-0000000000a3',
  clean: '00000000-0000-7000-8000-0000000000a4',
  debtGapUp: '00000000-0000-7000-8000-0000000000b1',
  debtReturned: '00000000-0000-7000-8000-0000000000b2',
  debtOld: '00000000-0000-7000-8000-0000000000b3',
  debtNew: '00000000-0000-7000-8000-0000000000b4',
  debtClean: '00000000-0000-7000-8000-0000000000b5',
  receipt: '00000000-0000-7000-8000-0000000000c1',
}

/** Thư mục migration chỉ tới trước bản điền ngược, để dựng DB đúng như đang chạy thật. */
function migrationsBeforeBackfill() {
  const dir = mkdtempSync(join(tmpdir(), 'kvl-backfill-'))
  cpSync(migrationsFolder, dir, { recursive: true })
  const journalPath = join(dir, 'meta/_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ tag: string }>
  }
  const cut = journal.entries.findIndex((e) => e.tag === BACKFILL_TAG)
  expect(cut).toBeGreaterThan(0)
  journal.entries = journal.entries.slice(0, cut)
  writeFileSync(journalPath, JSON.stringify(journal))
  return dir
}

let pglite: PGlite | undefined
let tmpDir: string | undefined

afterEach(async () => {
  await pglite?.close()
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
})

describe('migration điền ngược sổ công nợ (R3)', () => {
  it('đưa dữ liệu lệch kiểu cũ về bất biến mà không đổi công nợ khách đang thấy', async () => {
    pglite = new PGlite({ extensions: { pg_trgm } })
    const db = pgliteDrizzle(pglite, { schema, casing: 'snake_case' })
    tmpDir = migrationsBeforeBackfill()
    await migrate(db, { migrationsFolder: tmpDir })

    // Dữ liệu do mã cũ sinh ra:
    // - gapUp (TIEN-03): đầu kỳ 500k, điều chỉnh giảm còn 400k (ghi vào paid), rồi tăng lên 450k
    //   chỉ sửa current_debt.
    // - returned (TIEN-01): đơn nợ 450k, phiếu thu 200k, trả hàng cấn 250k (cũng ghi vào paid).
    // - gapDown: tổng khoản nợ còn 200k nhưng công nợ khách 150k (sửa tay).
    // - clean: không lệch.
    await pglite.exec(`
      INSERT INTO stores (id, name) VALUES ('${ids.store}', 'Cửa hàng');
      INSERT INTO users (id, store_id, name, phone, password_hash, role)
        VALUES ('${ids.owner}', '${ids.store}', 'Chủ', '0900000000', 'x', 'owner');
      INSERT INTO customers (id, store_id, code, name, current_debt) VALUES
        ('${ids.gapUp}', '${ids.store}', 'KH1', 'Lệch tăng', 450000),
        ('${ids.returned}', '${ids.store}', 'KH2', 'Trả hàng', 0),
        ('${ids.gapDown}', '${ids.store}', 'KH3', 'Lệch giảm', 150000),
        ('${ids.clean}', '${ids.store}', 'KH4', 'Không lệch', 70000);
      INSERT INTO debts (id, store_id, customer_id, type, amount, paid, remaining, created_at) VALUES
        ('${ids.debtGapUp}', '${ids.store}', '${ids.gapUp}', 'opening', 500000, 100000, 400000, '2026-08-25'),
        ('${ids.debtReturned}', '${ids.store}', '${ids.returned}', 'sale', 450000, 450000, 0, '2026-09-01'),
        ('${ids.debtOld}', '${ids.store}', '${ids.gapDown}', 'sale', 100000, 0, 100000, '2026-09-02'),
        ('${ids.debtNew}', '${ids.store}', '${ids.gapDown}', 'sale', 100000, 0, 100000, '2026-09-03'),
        ('${ids.debtClean}', '${ids.store}', '${ids.clean}', 'sale', 70000, 0, 70000, '2026-09-04');
      INSERT INTO receipts (id, store_id, customer_id, amount, created_by)
        VALUES ('${ids.receipt}', '${ids.store}', '${ids.returned}', 200000, '${ids.owner}');
      INSERT INTO receipt_allocations (id, receipt_id, debt_id, amount)
        VALUES (gen_random_uuid(), '${ids.receipt}', '${ids.debtReturned}', 200000);
      INSERT INTO debt_adjustments (id, store_id, customer_id, old_amount, new_amount, reason, adjusted_by, created_at) VALUES
        (gen_random_uuid(), '${ids.store}', '${ids.gapUp}', 500000, 400000, 'Chiết khấu', '${ids.owner}', '2026-09-10'),
        (gen_random_uuid(), '${ids.store}', '${ids.gapUp}', 400000, 450000, 'Phí vận chuyển', '${ids.owner}', '2026-09-12T00:00:00Z');
    `)

    // Chạy tiếp các migration còn lại như khi triển khai lên DB thật
    await migrate(db, { migrationsFolder })

    await expectDebtLedgerConsistent(db as unknown as Db, ids.store)

    const { rows } = await pglite.query<{
      id: string
      customer_id: string
      type: string
      amount: string
      paid: string
      reduced: string
      remaining: string
      note: string | null
      created_at: Date
    }>(
      `SELECT id, customer_id, type, amount::text, paid::text, reduced::text, remaining::text, note, created_at
       FROM debts ORDER BY customer_id, created_at, id`,
    )
    const byId = new Map(rows.map((r) => [r.id, r]))

    // TIEN-01: phần "paid" không có phân bổ phiếu thu chuyển sang giảm trừ
    expect(byId.get(ids.debtGapUp)).toMatchObject({
      paid: '0',
      reduced: '100000',
      remaining: '400000',
    })
    expect(byId.get(ids.debtReturned)).toMatchObject({
      paid: '200000',
      reduced: '250000',
      remaining: '0',
    })

    // TIEN-03: phần chênh thành khoản nợ điều chỉnh, ngày là lần tăng gần nhất
    const filled = rows.filter((r) => r.customer_id === ids.gapUp && r.type === 'adjustment')
    expect(filled).toHaveLength(1)
    expect(filled[0]).toMatchObject({
      amount: '50000',
      paid: '0',
      reduced: '0',
      remaining: '50000',
    })
    expect(filled[0]!.note).toContain('Điều chỉnh điền ngược')
    expect(new Date(filled[0]!.created_at).toISOString()).toBe('2026-09-12T00:00:00.000Z')

    // Chiều ngược: giảm trừ FIFO vào khoản cũ nhất, công nợ khách giữ nguyên 150k
    expect(byId.get(ids.debtOld)).toMatchObject({ reduced: '50000', remaining: '50000' })
    expect(byId.get(ids.debtOld)!.note).toContain('Điều chỉnh điền ngược')
    expect(byId.get(ids.debtNew)).toMatchObject({ reduced: '0', remaining: '100000' })

    expect(byId.get(ids.debtClean)).toMatchObject({
      paid: '0',
      reduced: '0',
      remaining: '70000',
      note: null,
    })

    const debtsNow = await pglite.query<{ id: string; current_debt: string }>(
      `SELECT id, current_debt::text FROM customers ORDER BY code`,
    )
    expect(debtsNow.rows.map((r) => r.current_debt)).toEqual(['450000', '0', '150000', '70000'])

    // Dấu vết kiểm toán: mỗi khách bị sửa khoản nợ có một dòng, khách không lệch thì không có
    const audit = await pglite.query<{
      target_id: string
      actor_id: string
      actor_role: string
      target_type: string
      changes: Record<string, unknown>
    }>(
      `SELECT target_id, actor_id, actor_role, target_type, changes FROM audit_logs
       WHERE action = 'debt_ledger.backfilled' ORDER BY target_id`,
    )
    const trail = (
      reason: string,
      currentDebt: number,
      before: number,
      after: number,
      moved: number,
    ) => ({
      reason,
      source: 'migration 0047_debt_ledger_backfill',
      currentDebt,
      before: { debtsRemaining: before },
      after: { debtsRemaining: after },
      paidMovedToReduced: moved,
    })
    const R3 = 'Điền ngược sổ công nợ R3'
    expect(audit.rows).toEqual([
      expect.objectContaining({
        target_id: ids.gapUp,
        changes: trail(R3, 450_000, 400_000, 450_000, 100_000),
      }),
      expect.objectContaining({ target_id: ids.returned, changes: trail(R3, 0, 0, 0, 250_000) }),
      expect.objectContaining({
        target_id: ids.gapDown,
        changes: trail(R3, 150_000, 200_000, 150_000, 0),
      }),
    ])
    for (const row of audit.rows) {
      expect(row).toMatchObject({
        actor_id: ids.owner,
        actor_role: 'owner',
        target_type: 'customer',
      })
    }

    // Script báo cáo trong docs/deploy.md chạy được và liệt kê đúng ba khách trên
    const report = await pglite.query<{
      ma_kh: string
      tong_con_lai_truoc: string
      tong_con_lai_sau: string
      khoan_no_dien_nguoc: string | null
    }>(readFileSync(reportScript, 'utf8'))
    expect(
      report.rows.map((r) => [
        r.ma_kh,
        String(r.tong_con_lai_truoc),
        String(r.tong_con_lai_sau),
        r.khoan_no_dien_nguoc,
      ]),
    ).toEqual([
      ['KH1', '400000', '450000', 'adjustment 50000 (con 50000, giam tru 0)'],
      ['KH2', '0', '0', null],
      ['KH3', '200000', '150000', 'sale 100000 (con 50000, giam tru 50000)'],
    ])
  })
})
