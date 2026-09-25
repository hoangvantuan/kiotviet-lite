/**
 * Tính lại giá vốn đã bị thổi do chiết khấu phiếu nhập cũ chưa trừ vào giá vốn (KHO-04).
 *
 * Mặc định chỉ in báo cáo chênh lệch, không ghi gì (chạy thử).
 *   pnpm --filter @kiotviet-lite/api cost:recalc
 *   pnpm --filter @kiotviet-lite/api cost:recalc -- --store <storeId>
 *   pnpm --filter @kiotviet-lite/api cost:recalc -- --json
 * Áp dụng (sao lưu DB trước):
 *   pnpm --filter @kiotviet-lite/api cost:recalc -- --apply
 */
import { closeDbPool, db } from '../db/index.js'
import {
  recalcInflatedPurchaseCosts,
  type RecalcRow,
} from '../services/purchase-cost-recalc.service.js'

const STATUS_LABEL: Record<RecalcRow['status'], string> = {
  fixable: 'Sửa được',
  manual_review: 'Xem tay',
  variant_parent: 'Có biến thể',
}

function vnd(n: number | null): string {
  return n === null ? '-' : n.toLocaleString('vi-VN')
}

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply')
  const json = argv.includes('--json')
  const storeIdx = argv.indexOf('--store')
  const storeId = storeIdx >= 0 ? argv[storeIdx + 1] : undefined
  return { apply, json, storeId }
}

async function main() {
  const { apply, json, storeId } = parseArgs(process.argv.slice(2))
  const result = await recalcInflatedPurchaseCosts({ db, storeId, apply })

  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  console.log(
    apply
      ? 'CHẾ ĐỘ ÁP DỤNG: giá vốn các dòng "Sửa được" và "Có biến thể" sẽ được ghi lại'
      : 'CHẠY THỬ: chỉ báo cáo, không ghi gì. Thêm --apply để áp dụng.',
  )
  if (result.rows.length === 0) {
    console.log('Không có phiếu nhập cũ nào làm sai giá vốn.')
    return
  }
  console.table(
    result.rows.map((r) => ({
      'Mã hàng': r.sku,
      'Trạng thái': STATUS_LABEL[r.status],
      'Tồn kho': r.currentStock,
      'Giá vốn hiện tại': vnd(r.currentCost),
      'Giá vốn đúng': vnd(r.correctedCost),
      'Lệch/đơn vị': vnd(r.diffPerUnit),
      'Giá trị tồn thổi': vnd(r.inflatedValue),
      'Chiết khấu bị bỏ': vnd(r.discountMissed),
      'Phiếu nhập': r.affectedPurchaseOrders.join(', '),
      'Đã ghi': r.applied ? 'có' : '',
    })),
  )
  for (const r of result.rows.filter((x) => x.reason)) {
    console.log(`- ${r.sku}: ${r.reason}`)
  }
  const fixable = result.rows.filter((r) => r.status === 'fixable')
  const totalInflated = fixable.reduce((s, r) => s + (r.inflatedValue ?? 0), 0)
  console.log(
    `Tổng: ${result.rows.length} sản phẩm, ${fixable.length} sửa được, giá trị tồn thổi ${vnd(totalInflated)} đ.`,
  )
}

main()
  .catch((err: unknown) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => closeDbPool())
