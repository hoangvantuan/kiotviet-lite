import { PGlite } from '@electric-sql/pglite'
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import * as schema from '@kiotviet-lite/shared/schema'
import { allocateOrderDiscount } from '@kiotviet-lite/shared/utils'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../db/migrations')
const reportScript = resolve(__dirname, '../../scripts/tien-101-over-refund-report.sql')
const SNAPSHOT_TAG_SUFFIX = '_order_snapshot_r2'

const ids = {
  store: '00000000-0000-7000-8000-000000000001',
  owner: '00000000-0000-7000-8000-000000000002',
  customer: '00000000-0000-7000-8000-000000000003',
  pack: '00000000-0000-7000-8000-0000000000a1',
  shirt: '00000000-0000-7000-8000-0000000000a2',
  shirtRed: '00000000-0000-7000-8000-0000000000a3',
  o1: '00000000-0000-7000-8000-0000000000b1',
  o2: '00000000-0000-7000-8000-0000000000b2',
  l1: '00000000-0000-7000-8000-0000000000c1',
  l2: '00000000-0000-7000-8000-0000000000c2',
  l3: '00000000-0000-7000-8000-0000000000c3',
  l4: '00000000-0000-7000-8000-0000000000c4',
}

/** Thư mục migration chỉ tới trước bản chụp số liệu R2, để dựng DB đúng như đang chạy thật. */
function migrationsBeforeSnapshot() {
  const dir = mkdtempSync(join(tmpdir(), 'kvl-r2-'))
  cpSync(migrationsFolder, dir, { recursive: true })
  const journalPath = join(dir, 'meta/_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ tag: string }>
  }
  const cut = journal.entries.findIndex((e) => e.tag.endsWith(SNAPSHOT_TAG_SUFFIX))
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

describe('migration điền ngược ảnh chụp chứng từ bán (R2)', () => {
  it('suy hệ số quy đổi, giá vốn ước tính, phân bổ chiết khấu và tiền trả lúc bán cho đơn cũ', async () => {
    pglite = new PGlite()
    const db = pgliteDrizzle(pglite, { schema, casing: 'snake_case' })
    tmpDir = migrationsBeforeSnapshot()
    await migrate(db, { migrationsFolder: tmpDir })

    // Dữ liệu do mã cũ sinh ra:
    // - Gói mì (đơn vị gốc "gói", "thùng" = 24): nhập 01/09 giá vốn 5.000, nhập 10/09 lên 9.000.
    // - Áo có biến thể đỏ: không có phiếu nhập, giá vốn biến thể hiện tại 70.000, cha 50.000.
    // - Đơn 1 (05/09): 2 thùng + 1 áo đỏ + 3 gói, chiết khấu đơn 10.001. Gói mì có hai dòng nên
    //   phiếu kho không tách được, hệ số lấy theo tên đơn vị.
    // - Đơn 2 (06/09, nợ 70.000): 1 "lốc" (không có trong bảng quy đổi), phiếu kho trừ 12 gói.
    await pglite.exec(`
      INSERT INTO stores (id, name) VALUES ('${ids.store}', 'Cửa hàng');
      INSERT INTO users (id, store_id, name, phone, password_hash, role)
        VALUES ('${ids.owner}', '${ids.store}', 'Chủ', '0900000000', 'x', 'owner');
      INSERT INTO customers (id, store_id, code, name, current_debt)
        VALUES ('${ids.customer}', '${ids.store}', 'KH1', 'Khách', 70000);
      INSERT INTO products (id, store_id, name, sku, unit, cost_price) VALUES
        ('${ids.pack}', '${ids.store}', 'Mì gói', 'MI', 'gói', 9000),
        ('${ids.shirt}', '${ids.store}', 'Áo', 'AO', 'cái', 50000);
      INSERT INTO product_variants (id, store_id, product_id, sku, attribute1_name, attribute1_value, cost_price)
        VALUES ('${ids.shirtRed}', '${ids.store}', '${ids.shirt}', 'AO-DO', 'Màu', 'Đỏ', 70000);
      INSERT INTO product_unit_conversions (id, store_id, product_id, unit, conversion_factor)
        VALUES (gen_random_uuid(), '${ids.store}', '${ids.pack}', 'thùng', 24);
      INSERT INTO inventory_transactions (id, store_id, product_id, type, quantity, cost_after, note, created_by, created_at) VALUES
        (gen_random_uuid(), '${ids.store}', '${ids.pack}', 'purchase', 100, 5000, 'PN1', '${ids.owner}', '2026-09-01'),
        (gen_random_uuid(), '${ids.store}', '${ids.pack}', 'purchase', 100, 9000, 'PN2', '${ids.owner}', '2026-09-10');
      INSERT INTO orders (id, store_id, order_number, user_id, customer_id, subtotal, discount_amount, total, payment_method, payment_status, created_at) VALUES
        ('${ids.o1}', '${ids.store}', 'HD001', '${ids.owner}', NULL, 200001, 10001, 190000, 'cash', 'paid', '2026-09-05'),
        ('${ids.o2}', '${ids.store}', 'HD002', '${ids.owner}', '${ids.customer}', 120000, 0, 120000, 'debt', 'partial', '2026-09-06');
      INSERT INTO order_items (id, order_id, product_id, variant_id, product_name, unit, unit_price, quantity, line_total, created_at) VALUES
        ('${ids.l1}', '${ids.o1}', '${ids.pack}', NULL, 'Mì gói', 'thùng', 50000, 2, 100000, '2026-09-05'),
        ('${ids.l2}', '${ids.o1}', '${ids.shirt}', '${ids.shirtRed}', 'Áo', 'cái', 50000, 1, 50000, '2026-09-05'),
        ('${ids.l3}', '${ids.o1}', '${ids.pack}', NULL, 'Mì gói', 'gói', 16667, 3, 50001, '2026-09-05'),
        ('${ids.l4}', '${ids.o2}', '${ids.pack}', NULL, 'Mì gói', 'lốc', 120000, 1, 120000, '2026-09-06');
      INSERT INTO inventory_transactions (id, store_id, product_id, variant_id, type, quantity, note, created_by, created_at) VALUES
        (gen_random_uuid(), '${ids.store}', '${ids.pack}', NULL, 'sale', -48, 'HD001', '${ids.owner}', '2026-09-05'),
        (gen_random_uuid(), '${ids.store}', '${ids.shirt}', '${ids.shirtRed}', 'sale', -1, 'HD001', '${ids.owner}', '2026-09-05'),
        (gen_random_uuid(), '${ids.store}', '${ids.pack}', NULL, 'sale', -3, 'HD001', '${ids.owner}', '2026-09-05'),
        (gen_random_uuid(), '${ids.store}', '${ids.pack}', NULL, 'sale', -12, 'HD002 (offline sync)', '${ids.owner}', '2026-09-06');
      INSERT INTO debts (id, store_id, customer_id, order_id, type, amount, remaining, created_at)
        VALUES (gen_random_uuid(), '${ids.store}', '${ids.customer}', '${ids.o2}', 'sale', 70000, 70000, '2026-09-06');
    `)

    // Chạy tiếp các migration còn lại như khi triển khai lên DB thật
    await migrate(db, { migrationsFolder })

    const { rows: items } = await pglite.query<{
      id: string
      conversion_factor: number
      unit_cost: string | null
      unit_cost_estimated: boolean
      order_discount_allocated: string
    }>(
      `SELECT id, conversion_factor, unit_cost::text, unit_cost_estimated,
              order_discount_allocated::text
       FROM order_items ORDER BY id`,
    )
    const byId = new Map(items.map((r) => [r.id, r]))

    // Hệ số: thùng theo bảng quy đổi, gói là đơn vị gốc, lốc suy từ phiếu kho (12 / 1)
    expect(byId.get(ids.l1)?.conversion_factor).toBe(24)
    expect(byId.get(ids.l2)?.conversion_factor).toBe(1)
    expect(byId.get(ids.l3)?.conversion_factor).toBe(1)
    expect(byId.get(ids.l4)?.conversion_factor).toBe(12)

    // Giá vốn: lần nhập gần nhất trước lúc bán (5.000, không phải 9.000 nhập sau), biến thể không
    // có phiếu nhập lấy giá vốn biến thể hiện tại. Tất cả đều gắn cờ ước tính.
    expect(byId.get(ids.l1)?.unit_cost).toBe('5000')
    expect(byId.get(ids.l2)?.unit_cost).toBe('70000')
    expect(byId.get(ids.l3)?.unit_cost).toBe('5000')
    expect(byId.get(ids.l4)?.unit_cost).toBe('5000')
    expect(items.every((r) => r.unit_cost_estimated)).toBe(true)

    // Phân bổ chiết khấu khớp đúng hàm dùng chung lúc bán
    const expected = allocateOrderDiscount([100_000, 50_000, 50_001], 10_001)
    expect(
      [ids.l1, ids.l2, ids.l3].map((id) => Number(byId.get(id)?.order_discount_allocated)),
    ).toEqual(expected)
    expect(expected).toEqual([5_001, 2_500, 2_500])
    expect(byId.get(ids.l4)?.order_discount_allocated).toBe('0')

    const { rows: orders } = await pglite.query<{
      id: string
      paid_amount_at_sale: string | null
      customer_debt_before: string | null
    }>(`SELECT id, paid_amount_at_sale::text, customer_debt_before::text FROM orders ORDER BY id`)
    expect(orders).toEqual([
      { id: ids.o1, paid_amount_at_sale: '190000', customer_debt_before: null },
      { id: ids.o2, paid_amount_at_sale: '50000', customer_debt_before: null },
    ])

    // Doanh thu ròng các dòng cộng lại đúng tổng đơn
    const { rows: net } = await pglite.query<{ net: string }>(
      `SELECT sum(line_total - order_discount_allocated)::text AS net FROM order_items WHERE order_id = '${ids.o1}'`,
    )
    expect(net[0]?.net).toBe('190000')
  })

  it('script TIEN-101 liệt kê dòng đơn có chiết khấu đơn bị hoàn dư qua nhiều phiếu trả', async () => {
    pglite = new PGlite()
    const db = pgliteDrizzle(pglite, { schema, casing: 'snake_case' })
    await migrate(db, { migrationsFolder })

    // Đơn 135.000, chiết khấu đơn 20% (27.000). Mã cũ trả 3 lần mỗi lần 36.000 = 108.000 là đúng,
    // nhưng áp lại tỷ lệ trên phần còn lại nên các phiếu hoàn 36.000 + 40.500 + 45.000.
    // Đơn thứ hai trả hai phiếu nhưng không có chiết khấu đơn: không liệt kê.
    await pglite.exec(`
      INSERT INTO stores (id, name) VALUES ('${ids.store}', 'Cửa hàng');
      INSERT INTO users (id, store_id, name, phone, password_hash, role)
        VALUES ('${ids.owner}', '${ids.store}', 'Chủ', '0900000000', 'x', 'owner');
      INSERT INTO products (id, store_id, name, sku) VALUES ('${ids.pack}', '${ids.store}', 'Mì gói', 'MI');
      INSERT INTO orders (id, store_id, order_number, user_id, subtotal, discount_amount, total, payment_method, payment_status) VALUES
        ('${ids.o1}', '${ids.store}', 'HD001', '${ids.owner}', 135000, 27000, 108000, 'cash', 'paid'),
        ('${ids.o2}', '${ids.store}', 'HD002', '${ids.owner}', 20000, 0, 20000, 'cash', 'paid');
      INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, line_total, order_discount_allocated) VALUES
        ('${ids.l1}', '${ids.o1}', '${ids.pack}', 'Mì gói', 45000, 3, 135000, 27000),
        ('${ids.l2}', '${ids.o2}', '${ids.pack}', 'Mì gói', 10000, 2, 20000, 0);
      INSERT INTO order_returns (id, store_id, order_id, return_number, total_amount, created_by, created_at) VALUES
        ('00000000-0000-7000-8000-0000000000d1', '${ids.store}', '${ids.o1}', 'TH001', 36000, '${ids.owner}', '2026-09-10'),
        ('00000000-0000-7000-8000-0000000000d2', '${ids.store}', '${ids.o1}', 'TH002', 40500, '${ids.owner}', '2026-09-11'),
        ('00000000-0000-7000-8000-0000000000d3', '${ids.store}', '${ids.o1}', 'TH003', 45000, '${ids.owner}', '2026-09-12'),
        ('00000000-0000-7000-8000-0000000000d4', '${ids.store}', '${ids.o2}', 'TH004', 10000, '${ids.owner}', '2026-09-10'),
        ('00000000-0000-7000-8000-0000000000d5', '${ids.store}', '${ids.o2}', 'TH005', 10000, '${ids.owner}', '2026-09-11');
      INSERT INTO order_return_items (id, return_id, order_item_id, product_id, product_name, unit_price, quantity, line_total, reason) VALUES
        (gen_random_uuid(), '00000000-0000-7000-8000-0000000000d1', '${ids.l1}', '${ids.pack}', 'Mì gói', 45000, 1, 36000, 'other'),
        (gen_random_uuid(), '00000000-0000-7000-8000-0000000000d2', '${ids.l1}', '${ids.pack}', 'Mì gói', 45000, 1, 40500, 'other'),
        (gen_random_uuid(), '00000000-0000-7000-8000-0000000000d3', '${ids.l1}', '${ids.pack}', 'Mì gói', 45000, 1, 45000, 'other'),
        (gen_random_uuid(), '00000000-0000-7000-8000-0000000000d4', '${ids.l2}', '${ids.pack}', 'Mì gói', 10000, 1, 10000, 'other'),
        (gen_random_uuid(), '00000000-0000-7000-8000-0000000000d5', '${ids.l2}', '${ids.pack}', 'Mì gói', 10000, 1, 10000, 'other');
    `)

    const report = await pglite.query<{
      ma_don: string
      sl_da_tra: string | number
      cac_phieu: string
      da_hoan: string | number
      dung: string | number
      chenh_lech: string | number
    }>(readFileSync(reportScript, 'utf8'))
    expect(
      report.rows.map((r) => [
        r.ma_don,
        String(r.sl_da_tra),
        r.cac_phieu,
        String(r.da_hoan),
        String(r.dung),
        String(r.chenh_lech),
      ]),
    ).toEqual([['HD001', '3', 'TH001, TH002, TH003', '121500', '108000', '13500']])
  })
})
